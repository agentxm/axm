/**
 * Verify the extension-type parity exemption ledger only ever shrinks.
 *
 * Usage:
 *   bun parity-ledger-check.ts
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { checkParityLedger } from "./parity-ledger-check-lib.js";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");
const result = checkParityLedger(repoRoot);

if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

console.log(result.message);
