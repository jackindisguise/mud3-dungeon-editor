/**
 * Map Editor HTTP Server
 *
 * Provides a web-based interface for editing dungeons, including:
 * - Room template management
 * - Mob/object template management
 * - Grid-based map editing
 * - Reset management
 * - Dimension editing with confirmation
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile, writeFile, readdir, access } from "fs/promises";
import { join } from "path";
import { constants as FS_CONSTANTS } from "fs";
import YAML from "js-yaml";
import {
	loadDungeon,
	saveDungeon,
	getAllDungeonIds,
	SerializedDungeonFormat,
} from "./mud3/src/package/dungeon.js";
import {
	getAllRaces,
	getAllJobs,
	getRaceById,
	getJobById,
} from "./mud3/src/package/archetype.js";
import { Mob } from "./mud3/src/dungeon.js";
import {
	COMMON_HIT_TYPES,
	PHYSICAL_DAMAGE_TYPE,
	MAGICAL_DAMAGE_TYPE,
} from "./mud3/src/damage-types.js";
import logger from "./mud3/src/logger.js";

const PORT = 3000;
const DUNGEON_DIR = join(process.cwd(), "data", "dungeons");
const MAP_EDITOR_DIR = join(process.cwd(), "map-editor");

// Verify map editor directory exists at startup (async check)
access(MAP_EDITOR_DIR, FS_CONSTANTS.F_OK)
	.then(() => {
		logger.debug(`Map editor directory found: ${MAP_EDITOR_DIR}`);
	})
	.catch((error) => {
		logger.error(`Map editor directory not found: ${MAP_EDITOR_DIR}`);
		logger.error(`Current working directory: ${process.cwd()}`);
	});

interface MapEditorServer {
	server: ReturnType<typeof createServer>;
	start(): Promise<void>;
	stop(): Promise<void>;
}

class MapEditorServerImpl implements MapEditorServer {
	public server = createServer(this.handleRequest.bind(this));

	private async handleRequest(
		req: IncomingMessage,
		res: ServerResponse
	): Promise<void> {
		const url = new URL(req.url || "/", `http://${req.headers.host}`);
		const path = url.pathname;

		// CORS headers
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, OPTIONS"
		);
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		try {
			// Serve static files
			if (path === "/" || path === "/index.html") {
				const filePath = join(MAP_EDITOR_DIR, "index.html");
				logger.debug(`Serving index.html from: ${filePath}`);
				await this.serveFile(res, filePath, "text/html");
				return;
			}

			if (path.startsWith("/static/")) {
				const filePath = path.replace("/static/", "");
				const fullPath = join(MAP_EDITOR_DIR, "static", filePath);
				logger.debug(`Serving static file: ${fullPath}`);
				const ext = filePath.split(".").pop()?.toLowerCase();
				const contentType =
					ext === "css"
						? "text/css"
						: ext === "js"
						? "application/javascript"
						: "text/plain";
				await this.serveFile(res, fullPath, contentType);
				return;
			}

			// API endpoints
			if (path === "/api/dungeons" && req.method === "GET") {
				await this.listDungeons(res);
				return;
			}

			if (path.startsWith("/api/dungeons/") && req.method === "GET") {
				const id = path.split("/")[3];
				await this.getDungeon(res, id);
				return;
			}

			if (path.startsWith("/api/dungeons/") && req.method === "POST") {
				const id = path.split("/")[3];
				await this.createDungeon(req, res, id);
				return;
			}

			if (path.startsWith("/api/dungeons/") && req.method === "PUT") {
				const id = path.split("/")[3];
				await this.updateDungeon(req, res, id);
				return;
			}

			if (path === "/api/races" && req.method === "GET") {
				await this.getRaces(res);
				return;
			}

			if (path === "/api/jobs" && req.method === "GET") {
				await this.getJobs(res);
				return;
			}

			if (path === "/api/calculate-attributes" && req.method === "POST") {
				await this.calculateAttributes(req, res);
				return;
			}

			if (path === "/api/hit-types" && req.method === "GET") {
				await this.getHitTypes(res);
				return;
			}

			// 404
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("Not Found");
		} catch (error) {
			logger.error(`Map editor server error: ${error}`);
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: String(error) }));
		}
	}

	private async serveFile(
		res: ServerResponse,
		filePath: string,
		contentType: string
	): Promise<void> {
		try {
			// Check if file exists first
			await access(filePath, FS_CONSTANTS.F_OK);
			const content = await readFile(filePath, "utf-8");
			res.writeHead(200, { "Content-Type": contentType });
			res.end(content);
		} catch (error) {
			logger.error(`Failed to serve file: ${filePath}`);
			logger.error(`Error details: ${error}`);
			logger.error(`Current working directory: ${process.cwd()}`);
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end(
				`File not found: ${filePath}\n\nCurrent directory: ${process.cwd()}`
			);
		}
	}

	private async listDungeons(res: ServerResponse): Promise<void> {
		const ids = await getAllDungeonIds();
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ dungeons: ids }));
	}

	private async getDungeon(res: ServerResponse, id: string): Promise<void> {
		// Read the raw YAML file directly (don't load into registry)
		const filePath = join(DUNGEON_DIR, `${id}.yaml`);
		try {
			const yamlContent = await readFile(filePath, "utf-8");

			// Parse YAML to get basic info without loading into registry
			const data = YAML.load(yamlContent) as SerializedDungeonFormat;

			if (!data.dungeon) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Invalid dungeon format" }));
				return;
			}

			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					id: data.dungeon.id || id,
					dimensions: data.dungeon.dimensions,
					resetMessage: data.dungeon.resetMessage,
					yaml: yamlContent,
				})
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Dungeon not found" }));
			} else {
				logger.error(`Failed to read dungeon ${id}: ${error}`);
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: String(error) }));
			}
		}
	}

	private async createDungeon(
		req: IncomingMessage,
		res: ServerResponse,
		id: string
	): Promise<void> {
		let body = "";
		for await (const chunk of req) {
			body += chunk;
		}

		const data = JSON.parse(body);

		// Check if dungeon already exists
		const filePath = join(DUNGEON_DIR, `${id}.yaml`);
		try {
			await access(filePath, FS_CONSTANTS.F_OK);
			// File exists
			res.writeHead(409, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Dungeon already exists" }));
			return;
		} catch (error) {
			// File doesn't exist, which is what we want
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				logger.error(`Failed to check dungeon existence ${id}: ${error}`);
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: String(error) }));
				return;
			}
		}

		// If YAML is provided, save it directly
		if (data.yaml) {
			const tempPath = `${filePath}.tmp`;

			try {
				// Ensure directory exists
				const { mkdir } = await import("fs/promises");
				await mkdir(DUNGEON_DIR, { recursive: true });

				// Write to temporary file first (atomic write)
				await writeFile(tempPath, data.yaml, "utf-8");
				// Atomically rename
				const { rename } = await import("fs/promises");
				await rename(tempPath, filePath);

				logger.debug(`Created dungeon YAML: ${id}`);
				res.writeHead(201, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true, id }));
				return;
			} catch (error) {
				// Clean up temp file
				try {
					const { unlink } = await import("fs/promises");
					await unlink(tempPath);
				} catch {
					// Ignore cleanup errors
				}
				logger.error(`Failed to create dungeon ${id}: ${error}`);
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: String(error) }));
				return;
			}
		}

		// Fallback: if no YAML provided, return error (YAML is required)
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({ error: "YAML data is required for dungeon creation" })
		);
	}

	private async updateDungeon(
		req: IncomingMessage,
		res: ServerResponse,
		id: string
	): Promise<void> {
		let body = "";
		for await (const chunk of req) {
			body += chunk;
		}

		const data = JSON.parse(body);

		// If YAML is provided, save it directly (preferred method)
		if (data.yaml) {
			const filePath = join(DUNGEON_DIR, `${id}.yaml`);
			const tempPath = `${filePath}.tmp`;

			try {
				// Write to temporary file first (atomic write)
				await writeFile(tempPath, data.yaml, "utf-8");
				// Atomically rename
				const { rename } = await import("fs/promises");
				await rename(tempPath, filePath);

				logger.debug(`Saved dungeon YAML: ${id}`);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
				return;
			} catch (error) {
				// Clean up temp file
				try {
					const { unlink } = await import("fs/promises");
					await unlink(tempPath);
				} catch {
					// Ignore cleanup errors
				}
				throw error;
			}
		}

		// Fallback: if no YAML provided, return error (YAML is required)
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "YAML data is required for updates" }));
	}

	private async getRaces(res: ServerResponse): Promise<void> {
		try {
			const races = getAllRaces();
			const raceList = races.map((race) => ({
				id: race.id,
				display: race.name,
			}));
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ races: raceList }));
		} catch (error) {
			logger.error(`Failed to get races: ${error}`);
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: String(error) }));
		}
	}

	private async getJobs(res: ServerResponse): Promise<void> {
		try {
			const jobs = getAllJobs();
			const jobList = jobs.map((job) => ({
				id: job.id,
				display: job.name,
			}));
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ jobs: jobList }));
		} catch (error) {
			logger.error(`Failed to get jobs: ${error}`);
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: String(error) }));
		}
	}

	private async calculateAttributes(
		req: IncomingMessage,
		res: ServerResponse
	): Promise<void> {
		let body = "";
		for await (const chunk of req) {
			body += chunk;
		}

		try {
			const data = JSON.parse(body);
			const { raceId, jobId, level } = data;

			if (!raceId || !jobId || level === undefined) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ error: "raceId, jobId, and level are required" })
				);
				return;
			}

			const race = getRaceById(raceId);
			const job = getJobById(jobId);

			if (!race || !job) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Invalid race or job ID" }));
				return;
			}

			// Create a temporary mob to calculate attributes
			const mob = new Mob({
				race,
				job,
				level: parseInt(level) || 1,
			});

			// Get calculated attributes
			const primary = mob.primaryAttributes;
			const secondary = mob.secondaryAttributes;
			const resourceCaps = {
				maxHealth: mob.maxHealth,
				maxMana: mob.maxMana,
			};

			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					primary,
					secondary,
					resourceCaps,
				})
			);
		} catch (error) {
			logger.error(`Failed to calculate attributes: ${error}`);
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: String(error) }));
		}
	}

	private async getHitTypes(res: ServerResponse): Promise<void> {
		try {
			// Convert COMMON_HIT_TYPES Map to a serializable format
			const hitTypes: Record<
				string,
				{
					verb: string;
					verbThirdPerson?: string;
					damageType: string;
				}
			> = {};
			for (const [key, hitType] of COMMON_HIT_TYPES) {
				hitTypes[key] = {
					verb: hitType.verb,
					verbThirdPerson: hitType.verbThirdPerson,
					damageType: hitType.damageType,
				};
			}
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					hitTypes,
					physicalDamageTypes: PHYSICAL_DAMAGE_TYPE,
					magicalDamageTypes: MAGICAL_DAMAGE_TYPE,
				})
			);
		} catch (error) {
			logger.error(`Failed to get hit types: ${error}`);
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: String(error) }));
		}
	}

	public async start(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server.listen(PORT, () => {
				logger.info(`Map editor server listening on http://localhost:${PORT}`);
				resolve();
			});
			this.server.once("error", reject);
		});
	}

	public async stop(): Promise<void> {
		return new Promise((resolve) => {
			this.server.close(() => {
				logger.info("Map editor server stopped");
				resolve();
			});
		});
	}
}

export function createMapEditorServer(): MapEditorServer {
	return new MapEditorServerImpl();
}
