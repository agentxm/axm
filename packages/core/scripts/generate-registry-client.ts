/**
 * Generate a typed Effect HTTP client from the registry OpenAPI spec.
 *
 * Usage:
 *   bun scripts/generate-registry-client.ts
 *
 * Reads the checked-in spec at `specs/registry-openapi.json` and writes the
 * generated client to `src/unstable/registry/__generated__/registry-client.ts`.
 *
 * To refresh the spec from a running registry instance:
 *   curl -s http://localhost:4300/v1/openapi.json > specs/registry-openapi.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..");
const SPEC_PATH = path.join(ROOT, "specs/registry-openapi.json");
const OUTPUT_DIR = path.join(ROOT, "src/unstable/registry/__generated__");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "registry-client.ts");
const CLIENT_NAME = "RegistryClient";

if (!fs.existsSync(SPEC_PATH)) {
  console.error(`Spec not found: ${SPEC_PATH}`);
  console.error(
    "Fetch it first: curl -s http://localhost:4300/v1/openapi.json > specs/registry-openapi.json",
  );
  process.exit(1);
}

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

const header = `// Generated from specs/registry-openapi.json — do not edit by hand.\n// Regenerate: nx run core:generate-registry-client\n\n`;
fs.writeFileSync(OUTPUT_PATH, header + result.stdout);

console.log(`Generated: ${path.relative(ROOT, OUTPUT_PATH)}`);
