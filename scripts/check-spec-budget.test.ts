import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SPECIFICATION_SUITE_BUDGET_SECONDS,
  checkSpecificationBudget,
  readSpecificationSeconds,
} from "./check-spec-budget-lib.js";

describe("specification suite budget", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-budget-"));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  const writeJunit = (suite: string, xml: string): void => {
    const directory = path.join(repoRoot, "test-results", suite);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "junit.xml"), xml);
  };

  it("sums testsuite times of specification files only", () => {
    const xml = `<?xml version="1.0"?><testsuites>
      <testsuite name="src/a.spec.ts" time="1.25"></testsuite>
      <testsuite name="src/b.spec.ts" timestamp="x" time="2.5"></testsuite>
      <testsuite name="src/c.test.ts" time="40"></testsuite>
    </testsuites>`;
    expect(readSpecificationSeconds(xml)).toBeCloseTo(3.75);
  });

  it("reports missing evidence for any owner instead of passing vacuously", () => {
    expect(checkSpecificationBudget(repoRoot, []).kind).toBe("no-evidence");
    writeJunit(
      "cli",
      `<testsuites><testsuite name="a.spec.ts" time="1.0"></testsuite></testsuites>`,
    );
    expect(checkSpecificationBudget(repoRoot, ["cli", "extension-lifecycle"]).kind).toBe(
      "no-evidence",
    );
  });

  it("passes within budget and fails over budget across owners", () => {
    writeJunit(
      "cli",
      `<testsuites><testsuite name="a.spec.ts" time="1.0"></testsuite></testsuites>`,
    );
    writeJunit(
      "extension-lifecycle",
      `<testsuites><testsuite name="b.spec.ts" time="2.0"></testsuite></testsuites>`,
    );
    const owners = ["cli", "extension-lifecycle"];
    const within = checkSpecificationBudget(repoRoot, owners);
    expect(within.kind).toBe("within-budget");
    expect(within.message).toContain("3.0s");
    writeJunit(
      "extension-lifecycle",
      `<testsuites><testsuite name="b.spec.ts" time="${SPECIFICATION_SUITE_BUDGET_SECONDS}"></testsuite></testsuites>`,
    );
    expect(checkSpecificationBudget(repoRoot, owners).kind).toBe("over-budget");
  });
});
