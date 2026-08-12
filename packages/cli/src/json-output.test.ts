import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import type {
  CancelledPlan,
  ExecutedPlan,
  PreviewedPlan,
} from "@agentxm/client-core/unstable/plan";

import {
  classifyPublishResults,
  PlanResolutionResultSchema,
  planResolutionToSummary,
  toPlanResolutionResult,
  type PublishResultItem,
} from "./json-output.js";
import { extensionName, handle } from "./test-stubs.js";

describe("classifyPublishResults", () => {
  it("derives every aggregate count from the item classifications", () => {
    const base: Pick<PublishResultItem, "owner" | "type" | "name"> = {
      owner: handle("@acme"),
      type: "skill",
      name: extensionName("review"),
    };
    const results: ReadonlyArray<PublishResultItem> = [
      { ...base, action: "publish", status: "success" },
      {
        ...base,
        name: extensionName("existing"),
        action: "skip",
        status: "success",
        reason: "version_already_published",
      },
      {
        ...base,
        name: extensionName("ignored"),
        action: "skip",
        status: "success",
        reason: "not_authored",
      },
      {
        ...base,
        name: extensionName("blocked"),
        action: "error",
        status: "blocked",
        reason: "blocked_by_preflight",
      },
      { ...base, name: extensionName("failed"), action: "error", status: "failed" },
      { ...base, name: extensionName("pending"), action: "publish", status: "pending" },
    ];

    expect(classifyPublishResults(results)).toEqual({
      selected: 6,
      published: 1,
      alreadyPublished: 1,
      skipped: 1,
      blocked: 1,
      failed: 1,
      pending: 1,
    });
  });
});

describe("toPlanResolutionResult", () => {
  const successfulRun = Effect.succeed({
    result: "success" as const,
    message: "",
  });

  it("maps previewed plans to preview counts", () => {
    const resolution: PreviewedPlan = {
      _tag: "PreviewedPlan",
      name: "Install skill",
      description: Option.some("Install @acme/skills/code-review"),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "Install @acme/skills/code-review",
              run: successfulRun,
            },
            {
              readiness: "warn",
              label: "Update lockfile",
              warnMessage: "Lockfile will be regenerated",
              run: successfulRun,
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution)).toEqual({
      outcome: "previewed",
      planName: "Install skill",
      planDescription: "Install @acme/skills/code-review",
      totalSteps: 2,
      readyCount: 1,
      warningCount: 1,
      errorCount: 0,
      appliedCount: 0,
      failedCount: 0,
      blockedCount: 0,
      steps: [
        { label: "Install @acme/skills/code-review", status: "ready" },
        {
          label: "Update lockfile",
          status: "warning",
          message: "Lockfile will be regenerated",
        },
      ],
    });
  });

  it("publishes schema-backed agent coverage only for successful executed outcomes", () => {
    const resolution: ExecutedPlan = {
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
                  scope: "user",
                  agents: ["codex"],
                  change: "created",
                },
              },
            },
          ],
        },
      ],
    };
    const agentCoverage = { scope: "user", agents: ["codex"] } as const;
    const successful = Schema.decodeUnknownSync(PlanResolutionResultSchema)(
      toPlanResolutionResult(resolution, { agentCoverage }),
    );
    const previewed: PreviewedPlan = {
      _tag: "PreviewedPlan",
      name: "Install skill",
      description: Option.none(),
      jobs: [],
    };

    expect(successful.agentCoverage).toEqual(agentCoverage);
    expect(toPlanResolutionResult(previewed, { agentCoverage })).not.toHaveProperty(
      "agentCoverage",
    );
  });

  it("maps release-age holdback and bypass evidence", () => {
    const resolution: PreviewedPlan = {
      _tag: "PreviewedPlan",
      name: "Update extensions",
      description: Option.none(),
      releaseAge: {
        evaluatedAt: "2026-08-12T00:00:00.000Z",
        holdbacks: [
          {
            reason: "minimum-release-age",
            target: "@acme/packs/toolkit",
            dependencyPath: ["@acme/packs/toolkit", "@acme/skills/review"],
            requestedRange: "^1.0.0",
            selectedVersion: "1.0.0",
            candidateVersion: "1.1.0",
            publishedAt: "2026-08-11T12:00:00.000Z",
            eligibleAt: "2026-08-12T12:00:00.000Z",
            minimumReleaseAgeSeconds: 86_400,
          },
        ],
        bypasses: [
          {
            reason: "minimum-release-age",
            bypassCause: "ignore-flag",
            target: "@acme/skills/direct",
            dependencyPath: ["@acme/skills/direct"],
            candidateVersion: "2.0.0",
            publishedAt: "2026-08-11T18:00:00.000Z",
            eligibleAt: "2026-08-12T18:00:00.000Z",
            minimumReleaseAgeSeconds: 86_400,
          },
        ],
      },
      jobs: [{ concurrency: 1, steps: [] }],
    };

    expect(toPlanResolutionResult(resolution)).toMatchObject({
      evaluatedAt: "2026-08-12T00:00:00.000Z",
      holdbackCount: 1,
      holdbacks: [
        {
          target: "@acme/packs/toolkit",
          dependencyPath: ["@acme/packs/toolkit", "@acme/skills/review"],
          selectedVersion: "1.0.0",
          candidateVersion: "1.1.0",
        },
      ],
      releaseAgeBypassCount: 1,
      releaseAgeBypasses: [{ target: "@acme/skills/direct", candidateVersion: "2.0.0" }],
    });
  });

  it("includes destructive targets in preview JSON", () => {
    const resolution: PreviewedPlan = {
      _tag: "PreviewedPlan",
      name: "Uninstall skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              artifact: {
                path: ".axm/axm-lock.yaml",
                scope: "project",
                change: "removed",
                targets: [
                  { path: ".axm/axm-lock.yaml", change: "updated" },
                  { path: ".agents/skills/code-review", change: "removed" },
                ],
              },
              run: successfulRun,
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution).steps).toEqual([
      {
        label: "code-review",
        status: "ready",
        artifact: {
          path: ".axm/axm-lock.yaml",
          scope: "project",
          change: "removed",
          targets: [{ path: ".agents/skills/code-review", change: "removed" }],
        },
      },
    ]);
  });

  it("maps cancelled plans to cancelled outcome", () => {
    const resolution: CancelledPlan = {
      _tag: "CancelledPlan",
      name: "Remove skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "error",
              label: "Remove code-review",
              errorMessage: "Blocked by dependent extension",
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution)).toEqual({
      outcome: "cancelled",
      planName: "Remove skill",
      totalSteps: 1,
      readyCount: 0,
      warningCount: 0,
      errorCount: 1,
      appliedCount: 0,
      failedCount: 0,
      blockedCount: 0,
      steps: [
        {
          label: "Remove code-review",
          status: "error",
          message: "Blocked by dependent extension",
        },
      ],
    });
  });

  it("maps executed failures and blocked steps distinctly", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Publish pack",
      description: Option.some("Publish @acme/packs/frontend-tools"),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "Publish dependency @acme/skills/code-review",
              result: {
                result: "error",
                message: "Version already exists",
                error: makeAppError({
                  code: "conflict",
                  detail: "Version already exists",
                }),
              },
            },
          ],
        },
        {
          concurrency: 1,
          steps: [
            {
              label: "Publish @acme/packs/frontend-tools",
              result: {
                result: "error",
                message: "blocked by earlier job failure",
                error: makeAppError({
                  code: "conflict",
                  detail: "blocked by earlier job failure",
                }),
              },
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution)).toEqual({
      outcome: "failed",
      planName: "Publish pack",
      planDescription: "Publish @acme/packs/frontend-tools",
      totalSteps: 2,
      readyCount: 0,
      warningCount: 0,
      errorCount: 0,
      appliedCount: 0,
      failedCount: 1,
      blockedCount: 1,
      steps: [
        {
          label: "Publish dependency @acme/skills/code-review",
          status: "failed",
          message: "Version already exists",
          code: "conflict",
        },
        {
          label: "Publish @acme/packs/frontend-tools",
          status: "blocked",
          message: "blocked by earlier job failure",
          code: "conflict",
        },
      ],
    });
  });

  it("maps mixed committed and failed steps to partial with committed artifacts", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Create extensions",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "Create review",
              result: {
                result: "success",
                message: "created",
                artifact: {
                  path: ".axm/extensions/@acme/skills/review",
                  scope: "project",
                  change: "created",
                },
              },
            },
            {
              label: "Create release",
              result: {
                result: "error",
                message: "write failed",
                error: makeAppError({ code: "internal", detail: "write failed" }),
              },
            },
          ],
        },
      ],
    };

    const result = toPlanResolutionResult(resolution);
    expect(result.outcome).toBe("partial");
    expect(result.appliedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.steps[0]).toMatchObject({
      status: "applied",
      artifact: {
        path: ".axm/extensions/@acme/skills/review",
        change: "created",
      },
    });
  });

  it("omits failed step error details by default", () => {
    const resolution: ExecutedPlan = {
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
                result: "error",
                message: "copy failed",
                error: makeAppError({
                  code: "internal",
                  detail: "copy failed",
                  cause: new Error("source missing"),
                }),
              },
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution).steps).toEqual([
      {
        label: "quality",
        status: "failed",
        message: "copy failed",
        code: "internal",
      },
    ]);
  });

  it("includes failed step cause chains in verbose output", () => {
    const resolution: ExecutedPlan = {
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
                result: "error",
                message: "copy failed",
                error: makeAppError({
                  code: "internal",
                  detail: "copy failed",
                  cause: new Error("source missing"),
                }),
              },
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution, { verbose: true }).steps).toEqual([
      {
        label: "quality",
        status: "failed",
        message: "copy failed",
        code: "internal",
        error: {
          code: "internal",
          message: "copy failed",
          causes: [{ _tag: "Error", message: "source missing" }],
        },
      },
    ]);
  });

  it("includes failed step cause stacks in debug output", () => {
    const cause = new Error("source missing");
    cause.stack = "Error: source missing\n    at copy";
    const resolution: ExecutedPlan = {
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
                result: "error",
                message: "copy failed",
                error: makeAppError({
                  code: "internal",
                  detail: "copy failed",
                  cause,
                }),
              },
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution, { debug: true }).steps).toEqual([
      {
        label: "quality",
        status: "failed",
        message: "copy failed",
        code: "internal",
        error: {
          code: "internal",
          message: "copy failed",
          causes: [
            {
              _tag: "Error",
              message: "source missing",
              stack: "Error: source missing\n    at copy",
            },
          ],
        },
      },
    ]);
  });

  it("includes links on successful executed steps", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Publish skill",
      description: Option.some("Publish @acme/skills/review"),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "Publish @acme/skills/review",
              result: {
                result: "success",
                message: "Published @acme/skills/review@1.0.0",
                links: { html: "https://agentxm.ai/acme/skills/review" },
              },
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution).steps).toEqual([
      {
        label: "Publish @acme/skills/review",
        status: "applied",
        message: "Published @acme/skills/review@1.0.0",
        links: { html: "https://agentxm.ai/acme/skills/review" },
      },
    ]);
  });

  it("includes structured warnings on successful executed steps", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Sync workspace",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "claude-code instruction file",
              result: {
                result: "success",
                message: "Updated CLAUDE.md",
                warnings: ["Overwriting drifted instruction file for claude-code"],
              },
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution)).toEqual({
      outcome: "applied",
      planName: "Sync workspace",
      totalSteps: 1,
      readyCount: 0,
      warningCount: 1,
      errorCount: 0,
      appliedCount: 1,
      failedCount: 0,
      blockedCount: 0,
      steps: [
        {
          label: "claude-code instruction file",
          status: "applied",
          message: "Updated CLAUDE.md",
          warnings: ["Overwriting drifted instruction file for claude-code"],
        },
      ],
    });
  });

  it("emits primary artifact path with additional target metadata", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Install skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "code-review",
              result: {
                result: "success",
                message: "Installed code-review",
                artifact: {
                  path: ".claude/skills/code-review",
                  scope: "project",
                  version: "1.2.3",
                  change: "created",
                  mechanism: "symlink",
                  fileCount: 4,
                  targets: [
                    {
                      path: ".agents/skills/code-review",
                      change: "created",
                      agentIds: ["antigravity", "amp"],
                    },
                    { path: ".claude/skills/code-review", change: "created" },
                  ],
                },
              },
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution).steps).toEqual([
      {
        label: "code-review",
        status: "applied",
        message: "Installed code-review",
        artifact: {
          path: ".claude/skills/code-review",
          scope: "project",
          version: "1.2.3",
          change: "created",
          mechanism: "symlink",
          fileCount: 4,
          targets: [
            {
              path: ".agents/skills/code-review",
              change: "created",
              agentIds: ["antigravity", "amp"],
            },
          ],
        },
      },
    ]);
  });

  it("includes artifact source details only in debug output", () => {
    const resolution: ExecutedPlan = {
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

    expect(toPlanResolutionResult(resolution).steps).toEqual([
      {
        label: "quality",
        status: "applied",
        message: "Installed quality",
        artifact: {
          path: ".agents/skills/quality",
          scope: "project",
          change: "created",
          fileCount: 9,
        },
      },
    ]);
    expect(toPlanResolutionResult(resolution, { debug: true }).steps).toEqual([
      {
        label: "quality",
        status: "applied",
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
    ]);
  });

  it("maps unchanged artifacts to no-op outcome without applied count", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Install skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "code-review",
              result: {
                result: "success",
                message: "code-review already installed",
                artifact: {
                  path: ".claude/skills/code-review",
                  scope: "project",
                  version: "1.2.3",
                  change: "unchanged",
                  fileCount: 4,
                },
              },
            },
          ],
        },
      ],
    };

    expect(toPlanResolutionResult(resolution)).toEqual({
      outcome: "no-op",
      planName: "Install skill",
      totalSteps: 1,
      readyCount: 0,
      warningCount: 0,
      errorCount: 0,
      appliedCount: 0,
      failedCount: 0,
      blockedCount: 0,
      steps: [
        {
          label: "code-review",
          status: "unchanged",
          message: "code-review already installed",
          artifact: {
            path: ".claude/skills/code-review",
            scope: "project",
            version: "1.2.3",
            change: "unchanged",
            fileCount: 4,
          },
        },
      ],
    });
  });

  it("preserves candidate identity and policy failure reasons", () => {
    expect(
      toPlanResolutionResult({
        _tag: "FailedPlan",
        name: "Uninstall skill",
        description: Option.none(),
        candidateId: "candidate-123",
        reason: "override-required",
        errorCode: "usage",
        riskConditions: [
          {
            level: "override-required",
            id: "installed-dependent",
            policy: "break-dependencies",
            requiredFlag: "--break-dependencies",
            detail: "An installed pack still requires the skill.",
          },
        ],
        jobs: [{ concurrency: 1, steps: [] }],
      }),
    ).toMatchObject({
      outcome: "failed",
      reason: "override-required",
      errorCode: "usage",
      candidateId: "candidate-123",
    });
  });
});

describe("planResolutionToSummary", () => {
  const successfulRun = Effect.succeed({
    result: "success" as const,
    message: "",
  });

  it("maps PreviewedPlan to previewed outcome with context", () => {
    const resolution: PreviewedPlan = {
      _tag: "PreviewedPlan",
      name: "Install skill",
      description: Option.some("Install @acme/skills/code-review"),
      jobs: [
        {
          concurrency: 1,
          steps: [{ readiness: "ready", label: "Install skill", run: successfulRun }],
        },
      ],
    };

    const summary = planResolutionToSummary(resolution, {
      subjectType: "skill",
      sourceKind: "registry",
    });

    expect(summary.outcome).toBe("previewed");
    expect(summary.subjectType).toBe("skill");
    expect(summary.sourceKind).toBe("registry");
    expect(summary.appliedCount).toBeUndefined();
    expect(summary.failedCount).toBeUndefined();
    expect(summary.blockedCount).toBeUndefined();
  });

  it("maps CancelledPlan to cancelled outcome", () => {
    const resolution: CancelledPlan = {
      _tag: "CancelledPlan",
      name: "Install skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [{ readiness: "ready", label: "Install skill", run: successfulRun }],
        },
      ],
    };

    const summary = planResolutionToSummary(resolution, {
      subjectType: "skill",
      sourceKind: "registry",
    });

    expect(summary.outcome).toBe("cancelled");
  });

  it("maps ExecutedPlan to applied outcome with counts", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Install skill",
      description: Option.some("Install 2 skills"),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "Install code-review",
              result: { result: "success", message: "installed" },
            },
            {
              label: "Install linter",
              result: { result: "success", message: "installed" },
            },
          ],
        },
      ],
    };

    const summary = planResolutionToSummary(resolution, {
      subjectType: "skill",
      sourceKind: "registry",
    });

    expect(summary.outcome).toBe("applied");
    expect(summary.subjectType).toBe("skill");
    expect(summary.sourceKind).toBe("registry");
    expect(summary.appliedCount).toBe(2);
    expect(summary.failedCount).toBeUndefined();
    expect(summary.blockedCount).toBeUndefined();
  });

  it("includes failedCount and blockedCount when non-zero", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Publish pack",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "Publish dep",
              result: {
                result: "error",
                message: "failed",
                error: makeAppError({ code: "internal", detail: "failed" }),
              },
            },
            {
              label: "Publish pack",
              result: {
                result: "error",
                message: "blocked",
                error: makeAppError({
                  code: "conflict",
                  detail: "blocked",
                }),
              },
            },
          ],
        },
      ],
    };

    const summary = planResolutionToSummary(resolution, {
      subjectType: "pack",
      sourceKind: "registry",
    });

    expect(summary.outcome).toBe("failed");
    expect(summary.failedCount).toBe(1);
    expect(summary.blockedCount).toBe(1);
    expect(summary.appliedCount).toBeUndefined();
  });

  it("omits zero counts from summary", () => {
    const resolution: ExecutedPlan = {
      _tag: "ExecutedPlan",
      name: "Install",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              label: "Install code-review",
              result: { result: "success", message: "ok" },
            },
          ],
        },
      ],
    };

    const summary = planResolutionToSummary(resolution, { subjectType: "skill" });

    expect(summary.appliedCount).toBe(1);
    expect(summary.failedCount).toBeUndefined();
    expect(summary.blockedCount).toBeUndefined();
  });

  it("preserves context subjectType and sourceKind", () => {
    const resolution: PreviewedPlan = {
      _tag: "PreviewedPlan",
      name: "Install",
      description: Option.none(),
      jobs: [{ concurrency: 1, steps: [] }],
    };

    const summary = planResolutionToSummary(resolution, {
      subjectType: "mcp-server",
      sourceKind: "local",
    });

    expect(summary.subjectType).toBe("mcp-server");
    expect(summary.sourceKind).toBe("local");
  });

  it("handles mixed subject type for workspace install", () => {
    const resolution: PreviewedPlan = {
      _tag: "PreviewedPlan",
      name: "Install configured extensions",
      description: Option.some("Install configured workspace extensions"),
      jobs: [{ concurrency: 1, steps: [] }],
    };

    const summary = planResolutionToSummary(resolution, {
      subjectType: "mixed",
      sourceKind: "workspace",
    });

    expect(summary.subjectType).toBe("mixed");
    expect(summary.sourceKind).toBe("workspace");
  });
});
