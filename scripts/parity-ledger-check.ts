/**
 * Verify the parity exemption ledger only shrinks.
 *
 * Compares the seed-tagged row count in the working tree's ledger against the
 * copy on `main`. A rising count means a new gap was disguised as pre-existing
 * debt, which the ledger exists to prevent.
 *
 * Usage:
 *   bun parity-ledger-check.ts
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { checkLedgerShrinkOnly } from "./parity-ledger-check-lib.js";

const LEDGER_PATH = "packages/core/src/unstable/extension-types/parity/exemptions.ts";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");

const currentSource = fs.readFileSync(path.join(repoRoot, LEDGER_PATH), "utf8");

const baseline = spawnSync("git", ["show", `main:${LEDGER_PATH}`], {
  cwd: repoRoot,
  encoding: "utf8",
});
const baselineSource = baseline.status === 0 ? baseline.stdout : undefined;

const result = checkLedgerShrinkOnly(currentSource, baselineSource);

if (!result.ok) {
  console.error(
    `Parity ledger seeded-row count rose from ${result.baseline} (main) to ${result.current}. ` +
      "New parity gaps must land as un-seeded ledger rows or be fixed, never disguised as " +
      "pre-existing debt.",
  );
  process.exit(1);
}

console.log(
  result.baseline === undefined
    ? `Parity ledger has ${result.current} seeded rows (no baseline on main yet).`
    : `Parity ledger seeded rows: ${result.current} (main: ${result.baseline}).`,
);
