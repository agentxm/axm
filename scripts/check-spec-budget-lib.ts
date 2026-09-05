/**
 * Fast specification suite performance budget.
 *
 * The in-memory specification suite must stay fast enough to run on every
 * change. The budget binds total reported vitest execution time from the
 * suite's JUnit output — deterministic per run and independent of Nx cache
 * effects. Raising the budget is a deliberate decision recorded in
 * `docs/architecture/decisions/specification-infrastructure.md`, never a
 * drive-by edit.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Total wall-clock seconds the fast specification suite may report. */
export const SPECIFICATION_SUITE_BUDGET_SECONDS = 120;

export type BudgetResult =
  | { readonly kind: "within-budget"; readonly message: string }
  | { readonly kind: "over-budget"; readonly message: string }
  | { readonly kind: "no-evidence"; readonly message: string };

export const readSuiteSeconds = (junitXml: string): number => {
  let total = 0;
  const pattern = /<testsuite\b[^>]*\btime="([0-9.]+)"/g;
  for (const match of junitXml.matchAll(pattern)) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds)) {
      total += seconds;
    }
  }
  return total;
};

export const checkSpecificationBudget = (repoRoot: string): BudgetResult => {
  const junitPath = path.join(repoRoot, "test-results", "specifications", "junit.xml");
  if (!fs.existsSync(junitPath)) {
    return {
      kind: "no-evidence",
      message: `No specification suite evidence at ${junitPath}; run the suite first.`,
    };
  }
  const seconds = readSuiteSeconds(fs.readFileSync(junitPath, "utf8"));
  if (seconds > SPECIFICATION_SUITE_BUDGET_SECONDS) {
    return {
      kind: "over-budget",
      message: `Specification suite reported ${seconds.toFixed(1)}s, over its ${SPECIFICATION_SUITE_BUDGET_SECONDS}s budget. Speed the suite up or revise the recorded budget decision.`,
    };
  }
  return {
    kind: "within-budget",
    message: `Specification suite within budget: ${seconds.toFixed(1)}s of ${SPECIFICATION_SUITE_BUDGET_SECONDS}s.`,
  };
};
