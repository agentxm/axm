import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SPECIFICATION_SUITE_BUDGET_SECONDS,
  checkSpecificationBudget,
  readSuiteSeconds,
} from "./check-spec-budget-lib.js";

describe("specification suite budget", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-budget-"));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  const writeJunit = (xml: string): void => {
    const directory = path.join(repoRoot, "test-results", "specifications");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "junit.xml"), xml);
  };

  it("sums testsuite times", () => {
    const xml = `<?xml version="1.0"?><testsuites>
      <testsuite name="a.spec.ts" time="1.25"></testsuite>
      <testsuite name="b.spec.ts" time="2.5"></testsuite>
    </testsuites>`;
    expect(readSuiteSeconds(xml)).toBeCloseTo(3.75);
  });

  it("reports missing evidence instead of passing vacuously", () => {
    expect(checkSpecificationBudget(repoRoot).kind).toBe("no-evidence");
  });

  it("passes within budget and fails over budget", () => {
    writeJunit(`<testsuites><testsuite name="a.spec.ts" time="1.0"></testsuite></testsuites>`);
    expect(checkSpecificationBudget(repoRoot).kind).toBe("within-budget");
    writeJunit(
      `<testsuites><testsuite name="a.spec.ts" time="${SPECIFICATION_SUITE_BUDGET_SECONDS + 1}"></testsuite></testsuites>`,
    );
    expect(checkSpecificationBudget(repoRoot).kind).toBe("over-budget");
  });
});
