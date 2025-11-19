#!/usr/bin/env node

/**
 * Setup script to enable debug logging for the map editor
 *
 * This script sets the LOG_LEVEL environment variable to 'debug' so that
 * all logger messages are sent to the console.
 *
 * Usage:
 *   node scripts/setup-debug-logging.js
 *   Or run: npm run start:debug
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

console.log("\x1b[36m%s\x1b[0m", "Setting LOG_LEVEL=debug for map editor...");
console.log(
	"\x1b[32m%s\x1b[0m",
	"Debug logging enabled. All logger messages will be sent to the console.\n"
);

try {
	// Set LOG_LEVEL=debug and run the map editor
	execSync("npm run map-editor", {
		cwd: projectRoot,
		stdio: "inherit",
		env: {
			...process.env,
			LOG_LEVEL: "debug",
		},
	});
} catch (error) {
	// execSync throws on non-zero exit codes, which is normal for interrupted processes
	// Only exit with error if there's an actual error
	if (error.status === undefined) {
		console.error("\x1b[31m%s\x1b[0m", `Error: ${error.message}`);
		process.exit(1);
	}
	process.exit(error.status || 0);
}
