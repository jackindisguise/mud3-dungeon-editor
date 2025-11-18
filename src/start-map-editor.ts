/**
 * Start the map editor server
 *
 * Run this script to start the HTTP server for the web-based map editor.
 * The server will be available at http://localhost:3000
 */

import { loadPackage } from "package-loader";
import { createMapEditorServer } from "./map-editor-server.js";
import logger from "./mud3/src/logger.js";
import dungeon from "./mud3/src/package/dungeon.js";
import archetype from "./mud3/src/package/archetype.js";

const server = createMapEditorServer();

async function start() {
	try {
		// Load packages so API endpoints work
		await logger.block("archetype", async () => {
			await loadPackage(archetype);
		});
		await logger.block("dungeon", async () => {
			await loadPackage(dungeon);
		});

		await server.start();
		logger.info("Map editor server is running. Press Ctrl+C to stop.");

		// Handle graceful shutdown
		process.on("SIGINT", async () => {
			logger.info("Shutting down map editor server...");
			await server.stop();
			process.exit(0);
		});

		process.on("SIGTERM", async () => {
			logger.info("Shutting down map editor server...");
			await server.stop();
			process.exit(0);
		});
	} catch (error) {
		logger.error(`Failed to start map editor server: ${error}`);
		process.exit(1);
	}
}

start();
