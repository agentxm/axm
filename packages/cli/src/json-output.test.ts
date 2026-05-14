import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import type {
  CancelledPlan,
  ExecutedPlan,
  PreviewedPlan,
} from "@agentxm/client-core/unstable/plan";

import { toPlanResolutionResult, planResolutionToSummary } from "./json-output.js";

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
      outcome: "applied",
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

    expect(summary.outcome).toBe("applied");
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
