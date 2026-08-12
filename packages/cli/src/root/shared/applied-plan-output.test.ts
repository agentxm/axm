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
                  agents: ["cursor", "claude-code", "universal"],
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
    expect(installationCoverage(plan)).toBeUndefined();
  });

  it("distinguishes applicable empty coverage from non-applicable target provenance", () => {
    const applicablePlan: ExecutedPlan = {
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
                  scope: "project",
                  agents: [],
                  change: "created",
                },
              },
            },
          ],
        },
      ],
    };
    const provenanceOnlyPlan: ExecutedPlan = {
      ...applicablePlan,
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "canonical package",
              result: {
                result: "success",
                message: "Installed canonical package",
                artifact: {
                  path: ".axm/extensions/@acme/skills/quality",
                  scope: "project",
                  change: "created",
                  targets: [
                    {
                      path: ".agents/skills/quality",
                      change: "created",
                      agentIds: ["codex"],
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };

    expect(installationCoverage(applicablePlan)).toEqual({ agents: [], scope: "project" });
    expect(installationCoverage(provenanceOnlyPlan)).toBeUndefined();
  });

  it("rejects target recipients outside the artifact union", () => {
    const invalidPlan: ExecutedPlan = {
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
                  scope: "project",
                  agents: ["cursor"],
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

    expect(() => installationCoverage(invalidPlan)).toThrow(
      "Artifact target agent claude-code is absent from artifact agents",
    );
  });

  it("rejects applicable artifacts from mixed scopes", () => {
    const mixedScopePlan: ExecutedPlan = {
      ...plan,
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "project quality",
              result: {
                result: "success",
                message: "Installed project quality",
                artifact: {
                  path: ".agents/skills/quality",
                  scope: "project",
                  agents: ["codex"],
                  change: "created",
                },
              },
            },
            {
              label: "user quality",
              result: {
                result: "success",
                message: "Installed user quality",
                artifact: {
                  path: ".agents/skills/quality",
                  scope: "user",
                  agents: ["claude-code"],
                  change: "created",
                },
              },
            },
          ],
        },
      ],
    };

    expect(() => installationCoverage(mixedScopePlan)).toThrow(
      "Installation coverage spans project and user scopes",
    );
  });
});
