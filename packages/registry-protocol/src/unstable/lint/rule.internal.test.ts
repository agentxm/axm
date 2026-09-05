import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { AdvisoryFinding, LintRule } from "./rule.js";

describe("lint rule contract", () => {
  it("represents intrinsic findings without mutation or guidance fields", () => {
    const finding: AdvisoryFinding = {
      kind: "advisory",
      ruleId: "workspace/example-valid",
      severity: "error",
      message: "Observed state does not satisfy the invariant.",
      location: { file: "axm.json" },
    };
    expect(finding.kind).toBe("advisory");
    expect("suggestions" in finding).toBe(false);
    expect("recovery" in finding).toBe(false);
  });

  it("rules expose checks but no fix capability", () => {
    const rule: LintRule<{ readonly root: string }> = {
      id: "workspace/example-valid",
      description: "Example state is valid.",
      kind: "advisory",
      severity: "error",
      check: () => Effect.succeed([]),
    };
    expect(rule.kind).toBe("advisory");
    expect("fix" in rule).toBe(false);
  });
});
