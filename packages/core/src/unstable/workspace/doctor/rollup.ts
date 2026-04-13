import type { Check, CheckStatus, Finding, ReportSummary } from "./types.js";

export const rollupFindings = (findings: ReadonlyArray<Finding>): Exclude<CheckStatus, "skip"> => {
  if (findings.some((f) => f.severity === "error")) {
    return "fail";
  }
  if (findings.some((f) => f.severity === "warn")) {
    return "warn";
  }
  return "pass";
};

const countBy = <T>(items: ReadonlyArray<T>, predicate: (item: T) => boolean): number =>
  items.reduce((n, item) => (predicate(item) ? n + 1 : n), 0);

export const summarize = (checks: ReadonlyArray<Check>): ReportSummary => {
  const findings = checks.flatMap((c) => c.findings);

  return {
    checks: {
      passed: countBy(checks, (c) => c.status === "pass"),
      warned: countBy(checks, (c) => c.status === "warn"),
      failed: countBy(checks, (c) => c.status === "fail"),
      skipped: countBy(checks, (c) => c.status === "skip"),
      info: countBy(
        checks,
        (c) => c.status === "pass" && c.findings.some((f) => f.severity === "info"),
      ),
    },
    findings: {
      errors: countBy(findings, (f) => f.severity === "error"),
      warnings: countBy(findings, (f) => f.severity === "warn"),
      info: countBy(findings, (f) => f.severity === "info"),
    },
  };
};
