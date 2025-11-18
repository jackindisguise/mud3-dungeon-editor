#!/usr/bin/env node

/**
 * Script to copy mud3's data directory to the project root
 * Usage: node scripts/copy-mud3-data.js
 */

import { rmSync, cpSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");
const mud3DataPath = join(projectRoot, "src", "mud3", "data");
const targetDataPath = join(projectRoot, "data");

console.log("Copying mud3 data directory to project root...\n");

if (!existsSync(mud3DataPath)) {
	console.error(`Error: mud3 data directory not found at ${mud3DataPath}`);
	process.exit(1);
}

// Remove existing data directory if it exists
if (existsSync(targetDataPath)) {
	console.log("Removing existing data directory...");
	try {
		rmSync(targetDataPath, { recursive: true, force: true });
	} catch (error) {
		console.error(`Error removing existing data directory: ${error.message}`);
		process.exit(1);
	}
}

// Copy the data directory
console.log(`Copying data from ${mud3DataPath} to ${targetDataPath}...`);
try {
	cpSync(mud3DataPath, targetDataPath, { recursive: true });
	console.log("\n✅ Successfully copied mud3 data directory!");
	console.log(`Copied to: ${targetDataPath}`);
} catch (error) {
	console.error(`\n❌ Error: Failed to copy data directory: ${error.message}`);
	process.exit(1);
}

console.log("\nDone.");
