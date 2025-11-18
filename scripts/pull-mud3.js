#!/usr/bin/env node

/**
 * Script to pull latest changes from mud3 repository
 * Usage: node scripts/pull-mud3.js
 */

import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");
const mud3Path = join(projectRoot, "src", "mud3");

console.log("Pulling latest changes from mud3 repository...\n");

if (!existsSync(mud3Path)) {
	console.error(`Error: mud3 directory not found at ${mud3Path}`);
	process.exit(1);
}

try {
	console.log(`Executing git pull in ${mud3Path}...`);
	execSync("git pull", {
		cwd: mud3Path,
		stdio: "inherit",
	});
	console.log("\n✅ Successfully pulled latest changes from mud3!");
} catch (error) {
	console.error(`\n❌ Error: git pull failed`);
	process.exit(1);
}

console.log("\nDone.");
