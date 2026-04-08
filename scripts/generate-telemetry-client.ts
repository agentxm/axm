/**
 * Fetch the telemetry OpenAPI spec and generate a typed Effect HTTP client.
 *
 * Usage:
 *   pnpm generate:telemetry
 *
 * Fetches the spec from a running telemetry instance, writes it to
 * `packages/core/specs/telemetry-openapi.json`, then generates the typed client to
 * `packages/core/src/unstable/telemetry/__generated__/telemetry-client.ts`.
 */

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — Bun codegen script, not Effect code
import { readEnvWithDefault } from "@axm.sh/utils/unstable/env";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const WORKSPACE_ROOT = path.join(import.meta.dirname, "..");
const CORE_ROOT = path.join(WORKSPACE_ROOT, "packages/core");
const SPEC_DIR = path.join(CORE_ROOT, "specs");
const SPEC_PATH = path.join(SPEC_DIR, "telemetry-openapi.json");
const OUTPUT_DIR = path.join(CORE_ROOT, "src/unstable/telemetry/__generated__");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "telemetry-client.ts");
const CLIENT_NAME = "TelemetryClient";
const TELEMETRY_URL = readEnvWithDefault(process.env, "AXM_TELEMETRY_URL", "http://localhost:4301");
const SPEC_URL = `${TELEMETRY_URL.replace(/\/+$/, "")}/v1/openapi.json`;

console.log(`Fetching OpenAPI spec from ${SPEC_URL}...`);

const fetchResult = childProcess.spawnSync("curl", ["-sf", "--max-time", "10", SPEC_URL], {
  encoding: "utf-8",
  timeout: 15_000,
});

if (fetchResult.status !== 0) {
  console.error(`Failed to fetch spec from ${SPEC_URL}`);
  console.error(fetchResult.stderr || "Is the telemetry service running? Check AXM_TELEMETRY_URL.");
  process.exit(1);
}

fs.mkdirSync(SPEC_DIR, { recursive: true });
fs.writeFileSync(SPEC_PATH, fetchResult.stdout);
console.log(`Spec written to ${path.relative(CORE_ROOT, SPEC_PATH)}`);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const result = childProcess.spawnSync(
  "npx",
  ["openapigen", "--spec", SPEC_PATH, "--name", CLIENT_NAME],
  { cwd: CORE_ROOT, encoding: "utf-8", timeout: 30_000 },
);

if (result.status !== 0) {
  console.error("openapigen failed:");
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

const header =
  "// Generated from specs/telemetry-openapi.json — do not edit by hand.\n// Regenerate: pnpm generate:telemetry\n\n";
fs.writeFileSync(OUTPUT_PATH, header + result.stdout);

console.log(`Generated: ${path.relative(CORE_ROOT, OUTPUT_PATH)}`);
console.log("Formatting...");

const formatResult = childProcess.spawnSync(
  "npx",
  ["prettier", "--write", SPEC_PATH, OUTPUT_PATH],
  { cwd: CORE_ROOT, encoding: "utf-8", timeout: 30_000 },
);

if (formatResult.status !== 0) {
  console.error("Format failed:");
  console.error(formatResult.stderr || formatResult.stdout);
  process.exit(1);
}

console.log("Done.");
