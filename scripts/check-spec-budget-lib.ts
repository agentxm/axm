/**
 * Fast specification suite performance budget.
 *
 * The in-memory specification suite must stay fast enough to run on every
 * change. The budget binds total reported vitest execution time of every
 * specification file across the owner projects' JUnit output — deterministic
 * per run and independent of Nx cache effects. Raising the budget is a
 * deliberate decision recorded in
 * `docs/architecture/decisions/colocated-specifications.md`, never a
 * drive-by edit.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Total wall-clock seconds the fast specification suite may report. */
export const SPECIFICATION_SUITE_BUDGET_SECONDS = 360;

export type BudgetResult =
  | { readonly kind: "within-budget"; readonly message: string }
  | { readonly kind: "over-budget"; readonly message: string }
  | { readonly kind: "no-evidence"; readonly message: string };

const TESTSUITE_PATTERN = /<testsuite\b[^>]*\bname="([^"]*)"[^>]*\btime="([0-9.]+)"/g;

/** Total reported seconds of every `<testsuite>` whose name is a specification file. */
export const readSpecificationSeconds = (junitXml: string): number => {
  let total = 0;
  for (const match of junitXml.matchAll(TESTSUITE_PATTERN)) {
    const [, name, time] = match;
    if (name === undefined || !name.endsWith(".spec.ts")) continue;
    const seconds = Number(time);
    if (Number.isFinite(seconds)) {
      total += seconds;
    }
  }
  return total;
};

/**
 * Sums specification time across the JUnit output of every owner suite. A
 * suite without output is missing evidence, never a free pass.
 */
export const checkSpecificationBudget = (
  repoRoot: string,
  suites: readonly string[],
): BudgetResult => {
  const missing: string[] = [];
  let seconds = 0;
  for (const suite of suites) {
    const junitPath = path.join(repoRoot, "test-results", suite, "junit.xml");
    if (!fs.existsSync(junitPath)) {
      missing.push(junitPath);
      continue;
    }
    seconds += readSpecificationSeconds(fs.readFileSync(junitPath, "utf8"));
  }
  if (suites.length === 0 || missing.length > 0) {
    return {
      kind: "no-evidence",
      message: `No specification suite evidence for ${
        suites.length === 0 ? "any owner project" : missing.join(", ")
      }; run the suite first.`,
    };
  }
  if (seconds > SPECIFICATION_SUITE_BUDGET_SECONDS) {
    return {
      kind: "over-budget",
      message: `Specification suite reported ${seconds.toFixed(1)}s across ${suites.length} owner(s), over its ${SPECIFICATION_SUITE_BUDGET_SECONDS}s budget. Speed the suite up or revise the recorded budget decision.`,
    };
  }
  return {
    kind: "within-budget",
    message: `Specification suite within budget: ${seconds.toFixed(1)}s of ${SPECIFICATION_SUITE_BUDGET_SECONDS}s across ${suites.length} owner(s).`,
  };
};
