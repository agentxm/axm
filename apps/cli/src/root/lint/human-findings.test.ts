import { describe, expect, it } from "@effect/vitest";
import type { RenderedFinding } from "@agentxm/workspace/linting";

import { toLintHumanFindings } from "./human-findings.js";

const finding = (
  ruleId: string,
  severity: "error" | "warning" | "info",
  message: string,
  path: string,
): RenderedFinding => ({
  group: "workspace",
  ruleDescription: `${ruleId} holds.`,
  displayRoot: ".",
  path,
  finding: { kind: "advisory", ruleId, severity, message, location: { file: path } },
});

describe("lint human findings", () => {
  it("derives repairability from the feature repair catalog", () => {
    const [fixable, manual] = toLintHumanFindings([
      finding("workspace/instructions-target-current", "warning", "Target is missing.", "./a"),
      finding("workspace/settings-keys-recognized", "warning", "Key is unknown.", "./b"),
    ]);
    expect(fixable?.fixable).toBe(true);
    expect(manual?.fixable).toBe(false);
  });

  it("orders errors first and separates title, detail, and help", () => {
    const humans = toLintHumanFindings([
      finding("workspace/a", "warning", "A warning.", "./a"),
      finding(
        "workspace/b",
        "error",
        "Lockfile is stale. Detail: 2 entries differ. Run axm sync.",
        "./z",
      ),
    ]);
    expect(humans.map((human) => human.ruleId)).toEqual(["workspace/b", "workspace/a"]);
    expect(humans[0]).toMatchObject({
      title: "Lockfile is stale.",
      details: ["2 entries differ."],
      helps: ["Run axm sync."],
    });
  });
});
