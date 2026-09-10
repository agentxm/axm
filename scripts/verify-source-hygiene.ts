/**
 * Verify that authored sources contain no forbidden C0 control bytes, that
 * production AXM environment literals are classified, that unbounded
 * concurrency stays within its reviewed baseline, and that test and
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
  countUnboundedConcurrencySites,
  findAxmEnvironmentContractViolations,
  findSourceHygieneViolations,
  findTestTaxonomyViolations,
  formatAxmEnvironmentContractViolation,
  formatTestTaxonomyViolation,
  formatViolation,
} from "./verify-source-hygiene-lib.js";
import { readWorkspace } from "./workspace-discovery.js";

// Reviewed 2026-08-18. Lower this ceiling whenever an existing literal is
// removed; never raise it to accommodate a new traversal.
const MAX_UNBOUNDED_CONCURRENCY_SITES = 186;

const workspace = await readWorkspace();
const violations = findSourceHygieneViolations(workspace);
const environmentContractViolations = findAxmEnvironmentContractViolations(workspace);
const unboundedConcurrencySites = countUnboundedConcurrencySites(workspace);

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

if (unboundedConcurrencySites > MAX_UNBOUNDED_CONCURRENCY_SITES) {
  console.error(
    `Unbounded concurrency baseline increased: ${unboundedConcurrencySites} > ${MAX_UNBOUNDED_CONCURRENCY_SITES}. Classify and bound the new traversal.`,
  );
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
console.log(
  `Verified literal unbounded concurrency did not exceed the reviewed ${MAX_UNBOUNDED_CONCURRENCY_SITES}-site baseline.`,
);
console.log("Verified test and specification filenames follow the discovery rules.");
