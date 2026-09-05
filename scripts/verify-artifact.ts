/**
 * Verify one identified binary artifact.
 *
 * Usage:
 *   AXM_BINARY_PATH=/path/to/axm-<platform> bun verify-artifact.ts
 *   bun verify-artifact.ts --binary /path/to/axm-<platform>
 *
 * Fails clearly when no artifact is identified rather than reporting a
 * vacuous pass; artifact verification always names its exact subject.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");

const argumentIndex = process.argv.indexOf("--binary");
const binaryPath =
  (argumentIndex >= 0 ? process.argv[argumentIndex + 1] : undefined) ??
  process.env["AXM_BINARY_PATH"];

if (binaryPath === undefined || binaryPath.length === 0) {
  console.error(
    "verify:artifact requires an identified artifact: pass --binary <path> or set AXM_BINARY_PATH.",
  );
  process.exit(1);
}
if (!fs.existsSync(binaryPath)) {
  console.error(`Identified artifact does not exist: ${binaryPath}`);
  process.exit(1);
}

console.log(`Verifying artifact: ${binaryPath}`);
const run = spawnSync(
  "pnpm",
  ["exec", "nx", "run", "cli-e2e:binary-smoke-artifact", "--outputStyle=static"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, AXM_BINARY_PATH: path.resolve(binaryPath) },
  },
);
process.exit(run.status ?? 1);
