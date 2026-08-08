import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { ExecutedPlan } from "@agentxm/client-core/unstable/plan";
import {
  failureHeadline,
  installationCoverage,
  summarizeExecutedOutcome,
} from "./applied-plan-output.js";

describe("failureHeadline", () => {
  it("rewrites agent membership success headlines as failures", () => {
    expect(failureHeadline("Configured 2 agents")).toBe("Failed to configure 2 agents");
    expect(failureHeadline("Removed 1 agent")).toBe("Failed to remove 1 agent");
  });
});

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

  it("collects the agents actually materialized by successful steps", () => {
    const coveragePlan: ExecutedPlan = {
      ...plan,
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
                  scope: "user",
                  agents: ["cursor", "universal"],
                  change: "created",
                  targets: [
                    {
                      path: ".claude/skills/quality",
                      change: "created",
                      agentIds: ["claude-code"],
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };

    expect(installationCoverage(coveragePlan)).toEqual({
      agents: ["cursor", "claude-code"],
      scope: "user",
    });
  });

  it("reports no agent coverage when an install only writes canonical content", () => {
    expect(installationCoverage(plan)).toEqual({ agents: [], scope: "project" });
  });
});
