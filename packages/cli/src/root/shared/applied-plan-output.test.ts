import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { ExecutedPlan } from "@agentxm/client-core/unstable/plan";
import { summarizeExecutedOutcome } from "./applied-plan-output.js";

describe("summarizeExecutedOutcome", () => {
  const plan: ExecutedPlan = {
    _tag: "ExecutedPlan",
    name: "Install skill",
    description: Option.none(),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            label: "quality",
            result: {
              result: "success",
              message: "Installed quality",
              artifact: {
                path: ".agents/skills/quality",
                scope: "project",
                change: "created",
                fileCount: 9,
                source: {
                  type: "github",
                  origin: "https://github.com/qualitymd/quality.md",
                  directory: ".",
                  gitTreeHash: "2ade2ca678e5f91a7d4dd31e74e84d1bcc3986eb",
                },
              },
            },
          },
        ],
      },
    ],
  };

  it("omits source details outside debug output", () => {
    expect(summarizeExecutedOutcome(plan)).toBe(
      "quality   created   9 files   .agents/skills/quality",
    );
  });

  it("includes source details in debug output", () => {
    expect(summarizeExecutedOutcome(plan, { debug: true })).toBe(
      [
        "quality   created   9 files   .agents/skills/quality",
        "  source: github https://github.com/qualitymd/quality.md   dir .   tree 2ade2ca678e5f91a7d4dd31e74e84d1bcc3986eb",
      ].join("\n"),
    );
  });
});
