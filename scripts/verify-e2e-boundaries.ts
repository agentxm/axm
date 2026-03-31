/**
 * Verify that e2e projects do not declare code dependencies on core or app packages.
 *
 * Usage:
 *   bun verify-e2e-boundaries.ts
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_BOUNDARY_RULES, findBoundaryViolations, formatViolation } from "./verify-e2e-boundaries-lib.js";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");
const violations = findBoundaryViolations(repoRoot);

if (violations.length > 0) {
  console.error("E2E boundary violations found:");
  for (const violation of violations) {
    console.error(`  ${formatViolation(violation)}`);
  }
  process.exit(1);
}

console.log(`Verified e2e boundaries for ${DEFAULT_BOUNDARY_RULES.length} projects.`);
