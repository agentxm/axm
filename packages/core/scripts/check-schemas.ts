/**
 * CI check to verify generated schemas are up to date.
 *
 * This script runs the schema generation and checks if there are
 * any uncommitted changes to the generated files. If changes exist,
 * it exits with an error to fail the CI build.
 */

import { execSync } from "node:child_process";
import * as path from "node:path";

const scriptsDir = import.meta.dirname;
const coreDir = path.join(scriptsDir, "..");

// First generate schemas
console.log("Generating schemas...");
execSync("bun scripts/generate-schemas.ts", {
  stdio: "inherit",
  cwd: coreDir,
});

// Check for changes in __generated__ directory
const status = execSync("git status --porcelain src/experimental/schemas/__generated__/", {
  encoding: "utf-8",
  cwd: coreDir,
});

if (status.trim()) {
  console.error("\nError: Generated schemas are out of date!");
  console.error("Run 'pnpm generate:schemas' and commit the changes.\n");
  console.error("Changed files:");
  console.error(status);
  process.exit(1);
}

console.log("\nGenerated schemas are up to date");
