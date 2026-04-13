import { describe, expect, it } from "vitest";
import { rollupFindings, summarize } from "./rollup.js";
import type { Check, Finding } from "./types.js";

const makeFinding = (severity: Finding["severity"], id: string): Finding => ({
  id,
  severity,
  message: `${severity} finding ${id}`,
});

describe("rollupFindings", () => {
  it("returns pass for an empty findings list", () => {
    expect(rollupFindings([])).toBe("pass");
  });

  it("returns pass for a single info finding", () => {
    expect(rollupFindings([makeFinding("info", "a.one")])).toBe("pass");
  });

  it("returns warn for a single warn finding", () => {
    expect(rollupFindings([makeFinding("warn", "a.one")])).toBe("warn");
  });

  it("returns fail for a single error finding", () => {
    expect(rollupFindings([makeFinding("error", "a.one")])).toBe("fail");
  });

  it("returns warn for mixed info and warn findings", () => {
    expect(rollupFindings([makeFinding("info", "a.one"), makeFinding("warn", "a.two")])).toBe(
      "warn",
    );
  });

  it("returns fail for mixed warn and error findings", () => {
    expect(rollupFindings([makeFinding("warn", "a.one"), makeFinding("error", "a.two")])).toBe(
      "fail",
    );
  });

  it("returns fail for mixed info and error findings", () => {
    expect(rollupFindings([makeFinding("info", "a.one"), makeFinding("error", "a.two")])).toBe(
      "fail",
    );
  });
});

const makeCheck = (
  id: string,
  status: Check["status"],
  findings: ReadonlyArray<Finding>,
  opts?: { readonly skipReason?: string },
): Check => ({
  id,
  title: `${id} title`,
  description: `${id} description`,
  dependsOn: [],
  status,
  ...(opts?.skipReason !== undefined ? { skipReason: opts.skipReason } : {}),
  findings,
});

describe("summarize", () => {
  it("counts statuses and severities across synthetic checks", () => {
    const checks: ReadonlyArray<Check> = [
      makeCheck("a", "pass", []),
      makeCheck("b", "pass", [makeFinding("info", "b.note")]),
      makeCheck("c", "pass", [makeFinding("info", "c.note1"), makeFinding("info", "c.note2")]),
      makeCheck("d", "warn", [makeFinding("warn", "d.warning")]),
      makeCheck("e", "fail", [makeFinding("error", "e.error"), makeFinding("warn", "e.warning")]),
      makeCheck("f", "skip", [], { skipReason: "depends on e" }),
    ];

    const summary = summarize(checks);

    expect(summary.checks.passed).toBe(3);
    expect(summary.checks.warned).toBe(1);
    expect(summary.checks.failed).toBe(1);
    expect(summary.checks.skipped).toBe(1);
    expect(summary.checks.info).toBe(2);

    expect(summary.findings.errors).toBe(1);
    expect(summary.findings.warnings).toBe(2);
    expect(summary.findings.info).toBe(3);
  });

  it("returns zeroes for an empty report", () => {
    expect(summarize([])).toEqual({
      checks: { passed: 0, warned: 0, failed: 0, skipped: 0, info: 0 },
      findings: { errors: 0, warnings: 0, info: 0 },
    });
  });

  it("does not count passing checks without info findings toward checks.info", () => {
    const summary = summarize([makeCheck("a", "pass", [])]);
    expect(summary.checks.info).toBe(0);
  });

  it("counts info findings on non-pass checks in findings.info but not in checks.info", () => {
    const summary = summarize([
      makeCheck("a", "warn", [makeFinding("info", "a.note"), makeFinding("warn", "a.warn")]),
    ]);
    expect(summary.checks.info).toBe(0);
    expect(summary.findings.info).toBe(1);
    expect(summary.findings.warnings).toBe(1);
  });
});
