/**
 * Verify that authored sources contain no forbidden C0 control bytes, that
 * production AXM environment literals are classified, and that test and
 * specification files follow the rules discovery relies on.
 *
 * A raw control byte (for example a literal NUL) makes a file invisible to
 * grep-based checks while it still compiles, so hygiene failures here are
 * failures of every other automated check's coverage.
 *
 * Usage:
 *   bun verify-source-hygiene.ts
 */

import {
  findAxmEnvironmentContractViolations,
  findSourceHygieneViolations,
  findTestTaxonomyViolations,
  formatAxmEnvironmentContractViolation,
  formatTestTaxonomyViolation,
  formatViolation,
} from "./verify-source-hygiene-lib.js";
import { readWorkspace } from "./workspace-discovery.js";

const workspace = await readWorkspace();
const violations = findSourceHygieneViolations(workspace);
const environmentContractViolations = findAxmEnvironmentContractViolations(workspace);

if (violations.length > 0) {
  console.error("Source hygiene violations found:");
  for (const violation of violations) {
    console.error(`  ${formatViolation(violation)}`);
  }
  process.exit(1);
}

if (environmentContractViolations.length > 0) {
  console.error("AXM environment contract violations found:");
  for (const violation of environmentContractViolations) {
    console.error(`  ${formatAxmEnvironmentContractViolation(violation)}`);
  }
  process.exit(1);
}

const taxonomyViolations = findTestTaxonomyViolations(workspace);
if (taxonomyViolations.length > 0) {
  console.error("Test taxonomy violations found:");
  for (const violation of taxonomyViolations) {
    console.error(`  ${formatTestTaxonomyViolation(violation)}`);
  }
  process.exit(1);
}

console.log("Verified authored sources contain no forbidden control bytes.");
console.log("Verified production AXM environment literals have classified reference rows.");
console.log("Verified test and specification filenames follow the discovery rules.");
