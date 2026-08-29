/**
 * Verify the deployed release distribution for one identified environment.
 *
 * Usage:
 *   AXM_INSTALL_BASE_URL=https://... AXM_EXPECTED_VERSION=x.y.z bun verify-deployment.ts
 *
 * Runs the installed-product verification against the identified endpoint.
 * Fails clearly when no environment is identified rather than reporting a
 * vacuous pass.
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");

const baseUrl = process.env["AXM_INSTALL_BASE_URL"];
const expectedVersion = process.env["AXM_EXPECTED_VERSION"];

if (baseUrl === undefined || baseUrl.length === 0) {
  console.error(
    "verify:deployment requires an identified environment: set AXM_INSTALL_BASE_URL (and AXM_EXPECTED_VERSION).",
  );
  process.exit(1);
}
if (expectedVersion === undefined || expectedVersion.length === 0) {
  console.error("verify:deployment requires AXM_EXPECTED_VERSION for the identified release.");
  process.exit(1);
}

console.log(`Verifying deployment at ${baseUrl} for version ${expectedVersion}`);
const run = spawnSync(
  "pnpm",
  ["exec", "nx", "run", "cli-e2e:install-verification", "--outputStyle=static"],
  { cwd: repoRoot, stdio: "inherit" },
);
process.exit(run.status ?? 1);
