import { describe, expect, it } from "vitest";

import { failureSummary } from "./failure-summary-reporter.js";

describe("failureSummary", () => {
  it("prints nothing for a run without failures", () => {
    expect(failureSummary([])).toEqual([]);
  });

  it("names each failed test under its file with the first line of why", () => {
    expect(
      failureSummary([
        {
          file: "apps/cli/src/screen/ask/pick.test.ts",
          name: "pickDoc > names a refusal beneath the hint",
          message: "expected 'a' to be 'b'\n\n- Expected\n+ Received",
          line: 42,
        },
        {
          file: "apps/cli/src/screen/ask/pick.test.ts",
          name: "pickRows > lists options without a group",
          message: "Test timed out in 20000ms.",
        },
        {
          file: "apps/cli/src/root/sync/handler.test.ts",
          name: "(file failed before its tests ran)",
          message: "Cannot find module './missing.js'",
        },
      ]),
    ).toEqual([
      "",
      "FAILED TESTS: 3 in 2 files",
      "",
      "apps/cli/src/screen/ask/pick.test.ts",
      "  x pickDoc > names a refusal beneath the hint (line 42)",
      "      expected 'a' to be 'b'",
      "  x pickRows > lists options without a group",
      "      Test timed out in 20000ms.",
      "",
      "apps/cli/src/root/sync/handler.test.ts",
      "  x (file failed before its tests ran)",
      "      Cannot find module './missing.js'",
      "",
    ]);
  });

  it("drops colour codes and cuts a long reason to one line", () => {
    const escape = String.fromCharCode(27);
    const [, , , , , reason] = failureSummary([
      { file: "a.test.ts", name: "t", message: `${escape}[31m${"x".repeat(400)}${escape}[39m` },
    ]);
    expect(reason).toBe(`      ${"x".repeat(199)}…`);
  });
});
