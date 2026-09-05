/**
 * Fetch the telemetry OpenAPI spec snapshot.
 *
 * Usage:
 *   pnpm exec nx run cli:sync:telemetry-spec
 */

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — Bun codegen script, not Effect code
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const CORE_ROOT = path.join(import.meta.dirname, "..");
const SPEC_DIR = path.join(CORE_ROOT, "specs");
const SPEC_PATH = path.join(SPEC_DIR, "telemetry-openapi.json");
const readEnvWithDefault = (name: string, fallback: string): string => {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
};
const TELEMETRY_URL = readEnvWithDefault("AXM_TELEMETRY_URL", "http://localhost:4301");
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

const formatResult = childProcess.spawnSync("pnpm", ["exec", "prettier", "--write", SPEC_PATH], {
  cwd: CORE_ROOT,
  encoding: "utf-8",
  timeout: 30_000,
});

if (formatResult.status !== 0) {
  console.error("Format failed:");
  console.error(formatResult.stderr || formatResult.stdout);
  process.exit(1);
}

console.log(`Synced: ${path.relative(CORE_ROOT, SPEC_PATH)}`);
