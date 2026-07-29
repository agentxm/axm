/**
 * Verify that package sources contain no forbidden C0 control bytes.
 *
 * A raw control byte (for example a literal NUL) makes a file invisible to
 * grep-based checks while it still compiles, so hygiene failures here are
 * failures of every other automated check's coverage.
 *
 * Usage:
 *   bun verify-source-hygiene.ts
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  findMachineOutputBoundaryViolations,
  findSourceHygieneViolations,
  formatMachineOutputBoundaryViolation,
  formatViolation,
} from "./verify-source-hygiene-lib.js";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");
const violations = findSourceHygieneViolations(repoRoot);
const machineOutputViolations = findMachineOutputBoundaryViolations(repoRoot);

if (violations.length > 0) {
  console.error("Source hygiene violations found:");
  for (const violation of violations) {
    console.error(`  ${formatViolation(violation)}`);
  }
  process.exit(1);
}

if (machineOutputViolations.length > 0) {
  console.error("Machine-output boundary violations found:");
  for (const violation of machineOutputViolations) {
    console.error(`  ${formatMachineOutputBoundaryViolation(violation)}`);
  }
  process.exit(1);
}

console.log("Verified package sources contain no forbidden control bytes.");
console.log("Verified production stdout is confined to approved renderer/runtime boundaries.");
