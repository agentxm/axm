/**
 * Fetch the registry OpenAPI spec and generate a typed Effect HTTP client.
 *
 * Usage:
 *   bun scripts/generate-registry-client.ts
 *
 * Fetches the spec from a running registry instance, writes it to
 * `specs/registry-openapi.json`, then generates the typed client to
 * `src/unstable/registry/__generated__/registry-client.ts`.
 */

import { readEnvWithDefault } from "@axm.sh/utils/unstable/env";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..");
const SPEC_DIR = path.join(ROOT, "specs");
const SPEC_PATH = path.join(SPEC_DIR, "registry-openapi.json");
const OUTPUT_DIR = path.join(ROOT, "src/unstable/registry/__generated__");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "registry-client.ts");
const CLIENT_NAME = "RegistryClient";
const REGISTRY_URL = readEnvWithDefault(process.env, "AXM_REGISTRY_URL", "http://localhost:4300");
const SPEC_URL = `${REGISTRY_URL.replace(/\/+$/, "")}/v1/openapi.json`;

// --- Fetch spec ---

console.log(`Fetching OpenAPI spec from ${SPEC_URL}...`);

const fetchResult = childProcess.spawnSync("curl", ["-sf", "--max-time", "10", SPEC_URL], {
  encoding: "utf-8",
  timeout: 15_000,
});

if (fetchResult.status !== 0) {
  console.error(`Failed to fetch spec from ${SPEC_URL}`);
  console.error(fetchResult.stderr || "Is the registry running? Check AXM_REGISTRY_URL.");
  process.exit(1);
}

fs.mkdirSync(SPEC_DIR, { recursive: true });
fs.writeFileSync(SPEC_PATH, fetchResult.stdout);
console.log(`Spec written to ${path.relative(ROOT, SPEC_PATH)}`);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const result = childProcess.spawnSync(
  "npx",
  ["openapigen", "--spec", SPEC_PATH, "--name", CLIENT_NAME],
  { cwd: ROOT, encoding: "utf-8", timeout: 30_000 },
);

if (result.status !== 0) {
  console.error("openapigen failed:");
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

const header = `// Generated from specs/registry-openapi.json — do not edit by hand.\n// Regenerate: pnpm generate\n\n`;
fs.writeFileSync(OUTPUT_PATH, header + result.stdout);

console.log(`Generated: ${path.relative(ROOT, OUTPUT_PATH)}`);

// --- Format generated files ---

console.log("Formatting...");

const formatResult = childProcess.spawnSync(
  "npx",
  ["prettier", "--write", SPEC_PATH, OUTPUT_PATH],
  { cwd: ROOT, encoding: "utf-8", timeout: 30_000 },
);

if (formatResult.status !== 0) {
  console.error("Format failed:");
  console.error(formatResult.stderr || formatResult.stdout);
  process.exit(1);
}

console.log("Done.");
