import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  makeOperationResolution,
  type JobStepArtifact,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/client-core/unstable/plan";

import {
  PlanResolutionResultSchema,
  operationResolutionSummary,
  toPlanResolutionResult,
} from "./operation-output.js";

const unit = (
  id: string,
  state: ResolvedUnit["state"],
  over?: Partial<ResolvedUnit>,
): ResolvedUnit =>
  ({
    id,
    label: id,
    state,
    ...over,
  }) satisfies ResolvedUnit;

const resolution = (
  over: Partial<Parameters<typeof makeOperationResolution>[0]> & {
    readonly units?: ReadonlyArray<ResolvedUnit>;
  },
): OperationResolution =>
  makeOperationResolution({
    name: "Update skills",
    description: Option.none(),
    mode: "apply",
    atomicity: { declared: "candidate-atomic", applied: "candidate-atomic" },
    units: [],
    ...over,
  });

describe("toPlanResolutionResult", () => {
  it("emits the plan-result-v2 contract with plan identity in a schema-backed document", () => {
    const value = resolution({
      description: Option.some("Update installed skills"),
      units: [unit("a", "committed")],
    });

    const result = Schema.decodeUnknownSync(PlanResolutionResultSchema)(
      toPlanResolutionResult(value),
    );

    expect(result.contract).toBe("plan-result-v2");
    expect(result.planName).toBe("Update skills");
    expect(result.planDescription).toBe("Update installed skills");
    expect(result.mode).toBe("apply");
    expect(result.outcome).toBe("applied");
  });

  it("C-13: a fully unchanged resolution projects no-op with unchanged covering the total", () => {
    const value = resolution({ units: [unit("a", "unchanged"), unit("b", "unchanged")] });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("no-op");
    expect(result.counts.unchanged).toBe(result.counts.total);
    expect(result.counts.total).toBe(2);
    expect(result.counts.committed).toBe(0);
  });

  it("C-12: operation-level blocking projects blocked with the typed blocking object — never failed", () => {
    const value = resolution({
      blocking: {
        class: "precondition-unmet",
        subject: "installed-dependent",
        phase: "planning",
        detail: "a precondition is unmet",
        causeCode: "conflict",
      },
      units: [unit("a", "ready")],
    });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("blocked");
    expect(result.blocking).toEqual({
      class: "precondition-unmet",
      subject: "installed-dependent",
      phase: "planning",
      detail: "a precondition is unmet",
      causeCode: "conflict",
    });
    expect(result).not.toHaveProperty("failure");
  });

  it("C-02: a stale-candidate blocking class is carried into the document with its escape", () => {
    const escape = { description: "Rerun the command to resolve a fresh candidate." };
    const value = resolution({
      blocking: {
        class: "stale-candidate",
        subject: "Update skills",
        phase: "validation",
        detail: "The execution candidate became stale before apply.",
        escape,
      },
      units: [unit("a", "ready")],
    });

    const result = Schema.decodeUnknownSync(PlanResolutionResultSchema)(
      toPlanResolutionResult(value),
    );

    expect(result.outcome).toBe("blocked");
    expect(result.blocking?.class).toBe("stale-candidate");
    expect(result.blocking?.phase).toBe("validation");
    expect(result.blocking?.escape).toEqual(escape);
  });

  it("C-14: surviving commits plus failures project partial and the counts reconcile", () => {
    const value = resolution({
      units: [
        unit("a", "committed"),
        unit("b", "failed", {
          message: "write failed",
          error: makeAppError({ code: "internal", detail: "write failed" }),
        }),
      ],
    });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("partial");
    expect(result.counts.committed).toBe(1);
    expect(result.counts.failed).toBe(1);
    expect(result.counts.committed + result.counts.failed).toBe(result.counts.total);
  });

  it("C-08: the counts partition sums to counts.total for a mixed multiset", () => {
    const value = resolution({
      units: [
        unit("a", "planned"),
        unit("b", "ready"),
        unit("c", "committed"),
        unit("d", "unchanged"),
        unit("e", "failed"),
        unit("f", "rolled-back"),
        unit("g", "blocked"),
        unit("h", "skipped"),
        unit("i", "cancelled", { warnings: ["annotated"] }),
      ],
    });

    const { counts } = toPlanResolutionResult(value);

    expect(
      counts.planned +
        counts.ready +
        counts.committed +
        counts.unchanged +
        counts.failed +
        counts.rolledBack +
        counts.blocked +
        counts.skipped +
        counts.cancelled,
    ).toBe(counts.total);
    expect(counts.total).toBe(9);
    expect(counts.warnings).toBe(1);
  });

  it("C-30: units are ordered by stable identity regardless of input order", () => {
    const value = resolution({
      units: [unit("b", "committed"), unit("c", "unchanged"), unit("a", "committed")],
    });

    const result = toPlanResolutionResult(value);

    expect(result.units.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("C-06: atomicity carries declared and applied classes and unit dispositions appear", () => {
    const value = resolution({
      atomicity: { declared: "candidate-atomic", applied: "non-rollbackable" },
      units: [unit("a", "committed"), unit("b", "failed", { disposition: "retained" })],
      failure: makeAppError({ code: "internal", detail: "restoration failed" }),
    });

    const result = toPlanResolutionResult(value);

    expect(result.atomicity).toEqual({
      declared: "candidate-atomic",
      applied: "non-rollbackable",
    });
    expect(result.units).toEqual([
      { id: "a", label: "a", state: "committed" },
      { id: "b", label: "b", state: "failed", disposition: "retained" },
    ]);
  });

  it("C-06: a restored execution projects rolled-back and untouched dispositions", () => {
    const value = resolution({
      units: [
        unit("a", "rolled-back", { disposition: "restored" }),
        unit("b", "failed", { disposition: "untouched" }),
      ],
      failure: makeAppError({ code: "validation", detail: "write failed" }),
    });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("failed");
    expect(result.units).toEqual([
      { id: "a", label: "a", state: "rolled-back", disposition: "restored" },
      { id: "b", label: "b", state: "failed", disposition: "untouched" },
    ]);
  });

  it("C-15: interruption appears in the document and the outcome is interrupted", () => {
    const value = resolution({
      units: [unit("a", "committed"), unit("b", "failed")],
      interruption: { signal: "SIGINT", disposition: "retained" },
    });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("interrupted");
    expect(result.interruption).toEqual({ signal: "SIGINT", disposition: "retained" });
  });

  it("failure carries code and message, with causes only under verbose", () => {
    const value = resolution({
      units: [unit("a", "failed")],
      failure: makeAppError({
        code: "conflict",
        detail: "integrity mismatch",
        cause: new Error("lock drift"),
      }),
    });

    expect(toPlanResolutionResult(value).failure).toEqual({
      code: "conflict",
      message: "integrity mismatch",
    });
    expect(toPlanResolutionResult(value, { verbose: true }).failure).toEqual({
      code: "conflict",
      message: "integrity mismatch",
      causes: [{ _tag: "Error", message: "lock drift" }],
    });
  });

  it("divergence on a preview resolution projects divergence true", () => {
    const value = resolution({
      mode: "preview",
      divergence: true,
      units: [unit("a", "ready")],
    });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("previewed");
    expect(result.divergence).toBe(true);
  });

  it("the message option lands in the document", () => {
    const result = toPlanResolutionResult(resolution({ units: [] }), {
      message: "Nothing to update",
    });

    expect(result.message).toBe("Nothing to update");
  });

  it("projects preview readiness counts and warning annotations", () => {
    const value = resolution({
      mode: "preview",
      description: Option.some("Install @acme/skills/code-review"),
      units: [
        unit("Install @acme/skills/code-review", "ready"),
        unit("Update lockfile", "ready", { warnings: ["Lockfile will be regenerated"] }),
      ],
    });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("previewed");
    expect(result.counts.ready).toBe(2);
    expect(result.counts.warnings).toBe(1);
    expect(result.counts.total).toBe(2);
  });

  it("carries release-age holdback and bypass evidence", () => {
    const value = resolution({
      mode: "preview",
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
    });

    expect(toPlanResolutionResult(value)).toMatchObject({
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

  it("projects agent coverage for applied and no-op resolutions whose units carry artifact agents", () => {
    const artifact: JobStepArtifact = {
      path: ".agents/skills/quality",
      scope: "user",
      agents: ["codex", "universal"],
      change: "created",
    };
    const applied = resolution({
      units: [unit("quality", "committed", { artifact })],
    });
    const noOp = resolution({
      units: [unit("quality", "unchanged", { artifact: { ...artifact, change: "unchanged" } })],
    });
    const previewed = resolution({
      mode: "preview",
      units: [unit("quality", "ready", { artifact })],
    });

    expect(toPlanResolutionResult(applied).agentCoverage).toEqual({
      scope: "user",
      agents: ["codex"],
    });
    expect(toPlanResolutionResult(noOp).agentCoverage).toEqual({
      scope: "user",
      agents: ["codex"],
    });
    expect(toPlanResolutionResult(previewed)).not.toHaveProperty("agentCoverage");
  });

  it("preserves the complete targeted update context in schema-backed output", () => {
    const value = resolution({
      mode: "preview",
      name: "Update @acme/skills/review",
      description: Option.some("Update one pack-derived member"),
    });
    const targetedUpdate = {
      target: { type: "skill" as const, name: "review", fqn: "@acme/skills/review" },
      ownership: "pack-only" as const,
      activation: "enabled" as const,
      authority: "pack-aware" as const,
      packs: [
        {
          fqn: "@acme/packs/toolkit",
          configuredName: "toolkit",
          source: "workspace" as const,
          memberSource: "registry" as const,
          constraint: "^1.0.0",
          enabled: true,
        },
      ],
      effectiveConstraint: ">=1.0.0 <2.0.0-0",
      memberClosure: [{ type: "skill" as const, name: "review", fqn: "@acme/skills/review" }],
      effects: {
        settings: "unchanged" as const,
        acceptedResolution: "may-update" as const,
        canonical: "may-update" as const,
        projection: "may-update" as const,
        packRoot: "unchanged" as const,
        packManifest: "unchanged" as const,
      },
      relevantProblems: [],
    };

    const result = Schema.decodeUnknownSync(PlanResolutionResultSchema)(
      toPlanResolutionResult(value, { targetedUpdate }),
    );

    expect(result.targetedUpdate).toEqual(targetedUpdate);
  });

  it("preserves candidate identity and risk conditions", () => {
    const value = resolution({
      candidateId: "candidate-123",
      blocking: {
        class: "override-required",
        subject: "installed-dependent",
        phase: "confirmation",
        detail: "The plan has unresolved warnings.",
      },
      riskConditions: [
        {
          level: "override-required",
          id: "installed-dependent",
          policy: "accept-warnings",
          requiredFlag: "--accept-warnings",
          detail: "The plan has unresolved warnings.",
        },
      ],
    });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("blocked");
    expect(result.candidateId).toBe("candidate-123");
    expect(result.riskConditions).toEqual([
      {
        level: "override-required",
        id: "installed-dependent",
        policy: "accept-warnings",
        requiredFlag: "--accept-warnings",
        detail: "The plan has unresolved warnings.",
      },
    ]);
  });

  it("omits unit error details by default, keeping the error code", () => {
    const value = resolution({
      units: [
        unit("quality", "failed", {
          message: "copy failed",
          error: makeAppError({
            code: "internal",
            detail: "copy failed",
            cause: new Error("source missing"),
          }),
        }),
      ],
    });

    expect(toPlanResolutionResult(value).units).toEqual([
      {
        id: "quality",
        label: "quality",
        state: "failed",
        message: "copy failed",
        code: "internal",
      },
    ]);
  });

  it("includes unit error cause chains in verbose output", () => {
    const value = resolution({
      units: [
        unit("quality", "failed", {
          message: "copy failed",
          error: makeAppError({
            code: "internal",
            detail: "copy failed",
            cause: new Error("source missing"),
          }),
        }),
      ],
    });

    expect(toPlanResolutionResult(value, { verbose: true }).units).toEqual([
      {
        id: "quality",
        label: "quality",
        state: "failed",
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

  it("includes unit error cause stacks in debug output", () => {
    const cause = new Error("source missing");
    cause.stack = "Error: source missing\n    at copy";
    const value = resolution({
      units: [
        unit("quality", "failed", {
          message: "copy failed",
          error: makeAppError({ code: "internal", detail: "copy failed", cause }),
        }),
      ],
    });

    expect(toPlanResolutionResult(value, { debug: true }).units).toEqual([
      {
        id: "quality",
        label: "quality",
        state: "failed",
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

  it("emits the primary artifact path with deduplicated additional target metadata", () => {
    const artifact: JobStepArtifact = {
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
    };
    const value = resolution({
      units: [unit("code-review", "committed", { message: "Installed code-review", artifact })],
    });

    expect(toPlanResolutionResult(value).units).toEqual([
      {
        id: "code-review",
        label: "code-review",
        state: "committed",
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
    const artifact: JobStepArtifact = {
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
    };
    const value = resolution({
      units: [unit("quality", "committed", { message: "Installed quality", artifact })],
    });

    expect(toPlanResolutionResult(value).units[0]?.artifact).toEqual({
      path: ".agents/skills/quality",
      scope: "project",
      change: "created",
      fileCount: 9,
    });
    expect(toPlanResolutionResult(value, { debug: true }).units[0]?.artifact).toEqual({
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
    });
  });

  it("includes links on committed units", () => {
    const value = resolution({
      units: [
        unit("Publish @acme/skills/review", "committed", {
          message: "Published @acme/skills/review@1.0.0",
          links: { html: "https://agentxm.ai/acme/skills/review" },
        }),
      ],
    });

    expect(toPlanResolutionResult(value).units).toEqual([
      {
        id: "Publish @acme/skills/review",
        label: "Publish @acme/skills/review",
        state: "committed",
        message: "Published @acme/skills/review@1.0.0",
        links: { html: "https://agentxm.ai/acme/skills/review" },
      },
    ]);
  });

  it("carries structured warnings on committed units and counts them as annotations", () => {
    const value = resolution({
      units: [
        unit("claude-code instruction file", "committed", {
          message: "Updated CLAUDE.md",
          warnings: ["Overwriting drifted instruction file for claude-code"],
        }),
      ],
    });

    const result = toPlanResolutionResult(value);

    expect(result.outcome).toBe("applied");
    expect(result.counts.warnings).toBe(1);
    expect(result.counts.committed).toBe(1);
    expect(result.units).toEqual([
      {
        id: "claude-code instruction file",
        label: "claude-code instruction file",
        state: "committed",
        message: "Updated CLAUDE.md",
        warnings: ["Overwriting drifted instruction file for claude-code"],
      },
    ]);
  });

  it("redacts credential material in unit messages, warnings, and artifact paths", () => {
    const artifact: JobStepArtifact = {
      path: "https://cdn.example/skills/quality?token=abc12345",
      scope: "project",
      change: "created",
      targets: [
        { path: "https://cdn.example/skills/quality?token=abc12345", change: "created" },
        { path: "https://mirror.example/skills/quality?token=abc12345", change: "created" },
      ],
    };
    const value = resolution({
      units: [
        unit("quality", "committed", {
          message: "fetched with token=abc12345",
          warnings: ["authorized via Bearer abc12345"],
          artifact,
        }),
      ],
    });

    const [projected] = toPlanResolutionResult(value).units;

    expect(projected?.message).toBe("fetched with token=[REDACTED]");
    expect(projected?.warnings).toEqual(["authorized via Bearer [REDACTED]"]);
    expect(projected?.artifact?.path).toBe("https://cdn.example/skills/quality?token=[REDACTED]");
    expect(projected?.artifact?.targets).toEqual([
      { path: "https://mirror.example/skills/quality?token=[REDACTED]", change: "created" },
    ]);
  });

  it("redacts credential material in blocking detail and failure messages", () => {
    const blocked = resolution({
      blocking: {
        class: "external-blocked",
        subject: "registry",
        phase: "apply",
        detail: "registry refused Bearer abc12345",
      },
    });
    const failed = resolution({
      units: [unit("a", "failed")],
      failure: makeAppError({ code: "internal", detail: "upload failed with api_key=abc12345" }),
    });

    expect(toPlanResolutionResult(blocked).blocking?.detail).toBe(
      "registry refused Bearer [REDACTED]",
    );
    expect(toPlanResolutionResult(failed).failure?.message).toBe(
      "upload failed with api_key=[REDACTED]",
    );
  });
});

describe("operationResolutionSummary", () => {
  it("maps a preview resolution to previewed with context and no counts", () => {
    const summary = operationResolutionSummary(
      resolution({ mode: "preview", units: [unit("a", "ready")] }),
      { subjectType: "skill", sourceKind: "registry" },
    );

    expect(summary.outcome).toBe("previewed");
    expect(summary.subjectType).toBe("skill");
    expect(summary.sourceKind).toBe("registry");
    expect(summary.appliedCount).toBeUndefined();
    expect(summary.failedCount).toBeUndefined();
    expect(summary.blockedCount).toBeUndefined();
  });

  it("maps a declined resolution to cancelled", () => {
    const summary = operationResolutionSummary(
      resolution({ declined: true, units: [unit("a", "ready")] }),
    );

    expect(summary.outcome).toBe("cancelled");
  });

  it("counts committed units as appliedCount and omits zero counts", () => {
    const summary = operationResolutionSummary(
      resolution({ units: [unit("a", "committed"), unit("b", "committed")] }),
      { subjectType: "skill", sourceKind: "registry" },
    );

    expect(summary.outcome).toBe("applied");
    expect(summary.subjectType).toBe("skill");
    expect(summary.sourceKind).toBe("registry");
    expect(summary.appliedCount).toBe(2);
    expect(summary.failedCount).toBeUndefined();
    expect(summary.blockedCount).toBeUndefined();
  });

  it("includes failedCount and blockedCount when non-zero", () => {
    const summary = operationResolutionSummary(
      resolution({
        units: [
          unit("a", "failed", {
            error: makeAppError({ code: "internal", detail: "failed" }),
          }),
          unit("b", "blocked", {
            blocking: {
              class: "operation-aborted",
              subject: "b",
              phase: "apply",
              detail: "blocked by earlier step failure",
              reference: "a",
            },
          }),
        ],
      }),
      { subjectType: "pack", sourceKind: "registry" },
    );

    expect(summary.outcome).toBe("failed");
    expect(summary.failedCount).toBe(1);
    expect(summary.blockedCount).toBe(1);
    expect(summary.appliedCount).toBeUndefined();
  });

  it("preserves subjectType and sourceKind context", () => {
    const preview = resolution({ mode: "preview" });

    const local = operationResolutionSummary(preview, {
      subjectType: "mcp-server",
      sourceKind: "local",
    });
    expect(local.subjectType).toBe("mcp-server");
    expect(local.sourceKind).toBe("local");

    const mixed = operationResolutionSummary(preview, {
      subjectType: "mixed",
      sourceKind: "workspace",
    });
    expect(mixed.subjectType).toBe("mixed");
    expect(mixed.sourceKind).toBe("workspace");
  });
});
