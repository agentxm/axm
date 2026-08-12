import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { makeAppError } from "../app-error/index.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { TestRenderer } from "../cli-renderer/index.js";
import {
  applyPlanExecution,
  promptablePlanExecution,
  preapprovedPlanExecution,
  previewPlanExecution,
  type ConfirmationRecovery,
} from "../cli-runtime/confirmation-recovery.js";
import {
  protectWorkspacePath,
  runWorkspaceTransaction,
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../workspace/index.js";
import { ResolvePlanInteractionTest } from "../workspace/resolve-plan-interaction.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import type { Plan } from "./plan.js";
import { makeExecutionCandidate } from "./execution-candidate.js";
import { previewOrApplyPlan } from "./resolve-plan.js";

const testRecovery: ConfirmationRecovery = { command: ["install"], arguments: [] };
const releaseAge = {
  evaluatedAt: "2026-08-12T00:00:00.000Z",
  holdbacks: [
    {
      reason: "minimum-release-age" as const,
      target: "@acme/skills/code-review",
      dependencyPath: ["@acme/skills/code-review"],
      selectedVersion: "1.0.0",
      candidateVersion: "1.1.0",
      publishedAt: "2026-08-11T12:00:00.000Z",
      eligibleAt: "2026-08-12T12:00:00.000Z",
      minimumReleaseAgeSeconds: 86_400,
    },
  ],
  bypasses: [],
};

const makeTestContext = (
  confirmApplyChanges?: () => Effect.Effect<boolean>,
  flagsOverrides?: { readonly quiet?: boolean; readonly nonInteractive?: boolean },
  workspace: WorkspaceMutationsService = makeBaseWorkspaceMock("/tmp/axm-preview/.axm"),
) => {
  const renderer = TestRenderer.make();
  const interaction = ResolvePlanInteractionTest(
    confirmApplyChanges === undefined ? undefined : { confirmApplyChanges },
  );

  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer({ nonInteractive: flagsOverrides?.nonInteractive ?? true, ...flagsOverrides }),
      Layer.succeed(WorkspaceMutations, workspace),
      interaction.layer,
    ),
    rendererState: renderer.state,
    interactionState: interaction.state,
  };
};

describe("previewOrApplyPlan", () => {
  it.effect("--preview --yes remains a dry run", () => {
    let appliedCount = 0;
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skill",
      description: Option.none(),
      releaseAge,
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "installed" };
              }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, {
        execution: previewPlanExecution,
      });

      expect(result._tag).toBe("PreviewedPlan");
      expect(result.releaseAge).toEqual(releaseAge);
      expect(appliedCount).toBe(0);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("narrates plan resolution and apply phases with the plan subject", () => {
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skill",
      description: Option.none(),
      releaseAge,
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.succeed({ result: "success", message: "installed" }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      });

      expect(context.rendererState.spinnerMessages).toEqual([
        "Resolving Install skill",
        "Resolved Install skill",
        "Applying Install skill",
        "Processed Install skill",
      ]);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("suppresses the pre-apply plan for a pre-confirmed quiet apply", () => {
    const context = makeTestContext(undefined, { quiet: true });
    const plan: Plan = {
      _tag: "Plan",
      name: "Publish skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.succeed({ result: "success", message: "published" }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      yield* previewOrApplyPlan(plan, { execution: preapprovedPlanExecution });

      expect(
        context.rendererState.logs.some(
          (entry) => entry._tag === "info" && entry.message.includes("Would publish"),
        ),
      ).toBe(false);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("applies an eligible explicit mutation without prompting", () => {
    let appliedCount = 0;
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skill",
      description: Option.none(),
      releaseAge,
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "installed" };
              }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, {
        execution: promptablePlanExecution(testRecovery),
      });

      expect(result._tag).toBe("ExecutedPlan");
      expect(result.releaseAge).toEqual(releaseAge);
      expect(appliedCount).toBe(1);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("displays confirmable risk before confirmation and cancels without execution", () => {
    let appliedCount = 0;
    let displayedBeforeConfirmation = false;
    const context = makeTestContext(
      () =>
        Effect.sync(() => {
          displayedBeforeConfirmation = context.rendererState.logs.some(
            (entry) => entry._tag === "info" && entry.message.includes("Would install"),
          );
          return false;
        }),
      { nonInteractive: false },
    );
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skill",
      description: Option.none(),
      releaseAge,
      riskConditions: [
        {
          level: "confirmable",
          id: "replace-unmanaged-target",
          detail: "Replace an unmanaged target",
        },
      ],
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "installed" };
              }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, {
        execution: promptablePlanExecution(testRecovery),
      });

      expect(result._tag).toBe("CancelledPlan");
      expect(result.releaseAge).toEqual(releaseAge);
      expect(displayedBeforeConfirmation).toBe(true);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(1);
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("rejects readiness errors before confirmation or execution", () => {
    let appliedCount = 0;
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skills",
      description: Option.none(),
      releaseAge,
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "safe-looking",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "installed" };
              }),
            },
            {
              readiness: "error",
              label: "invalid",
              errorMessage: "source is invalid",
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      });

      expect(result).toMatchObject({
        _tag: "FailedPlan",
        reason: "hard-blocked",
        errorCode: "conflict",
        releaseAge,
      });
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("does not prompt for an empty no-op plan", () => {
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skills",
      description: Option.none(),
      jobs: [{ concurrency: 1, steps: [] }],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, {
        execution: promptablePlanExecution(testRecovery),
      });

      expect(result._tag).toBe("ExecutedPlan");
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("includes release-age evidence in execution candidate identity", () =>
    Effect.gen(function* () {
      const base: Plan = {
        _tag: "Plan",
        name: "Update skill",
        description: Option.none(),
        jobs: [{ concurrency: 1, steps: [] }],
      };
      const withoutEvidence = yield* makeExecutionCandidate(
        base,
        "/tmp/axm-candidate/.axm",
        "/tmp",
      );
      const withEvidence = yield* makeExecutionCandidate(
        { ...base, releaseAge },
        "/tmp/axm-candidate/.axm",
        "/tmp",
      );

      expect(withEvidence.id).not.toBe(withoutEvidence.id);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("requires deterministic approval for confirmable risk in non-interactive mode", () => {
    let appliedCount = 0;
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Replace unmanaged target",
      description: Option.none(),
      riskConditions: [
        { level: "confirmable", id: "replace-unmanaged-target", detail: "Replace target" },
      ],
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "target",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "replaced" };
              }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, {
        execution: promptablePlanExecution(testRecovery),
      });
      expect(result).toMatchObject({
        _tag: "FailedPlan",
        reason: "approval-required",
        errorCode: "usage",
      });
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("does not let --yes accept a named policy override", () => {
    let appliedCount = 0;
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Break dependents",
      description: Option.none(),
      riskConditions: [
        {
          level: "override-required",
          id: "installed-dependents",
          policy: "break-dependencies",
          requiredFlag: "--break-dependencies",
          detail: "Installed dependents will break",
        },
      ],
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "dependency",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "removed" };
              }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const rejected = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      });
      expect(rejected).toMatchObject({ _tag: "FailedPlan", reason: "override-required" });
      expect(appliedCount).toBe(0);

      const accepted = yield* previewOrApplyPlan(plan, {
        execution: applyPlanExecution({
          approval: "prompt-if-interactive",
          acceptedPolicies: new Set(["break-dependencies"]),
          recovery: testRecovery,
        }),
      });
      expect(accepted._tag).toBe("ExecutedPlan");
      expect(appliedCount).toBe(1);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("fails a candidate that changes after display without applying it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-candidate-" });
      const material = `${directory}/manifest.json`;
      yield* fs.writeFileString(material, "before");
      let appliedCount = 0;
      const context = makeTestContext(
        () => fs.writeFileString(material, "after").pipe(Effect.as(true), Effect.orDie),
        { nonInteractive: false },
        makeBaseWorkspaceMock(`${directory}/.axm`),
      );
      const plan: Plan = {
        _tag: "Plan",
        name: "Update package",
        description: Option.none(),
        materialPaths: [material],
        riskConditions: [
          { level: "confirmable", id: "publisher-change", detail: "Publisher changed" },
        ],
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "package",
                run: Effect.sync(() => {
                  appliedCount += 1;
                  return { result: "success" as const, message: "updated" };
                }),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: promptablePlanExecution(testRecovery),
      }).pipe(Effect.provide(context.layer));
      expect(result).toMatchObject({ _tag: "FailedPlan", reason: "stale-candidate" });
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rolls back the complete local candidate when a later step fails", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-rollback-" });
      const workspaceDir = path.join(directory, ".axm");
      const target = path.join(directory, "managed.txt");
      yield* fs.writeFileString(target, "original");
      const baseWorkspace = makeBaseWorkspaceMock(workspaceDir);
      const workspace: WorkspaceMutationsService = {
        ...baseWorkspace,
        runTransaction: (args) =>
          runWorkspaceTransaction({
            workspaceDir,
            targets: args.targets ?? [],
            transition: args.transition,
            validate: args.validate,
            ...(args.receipt === undefined ? {} : { receipt: args.receipt }),
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
      };
      const context = makeTestContext(undefined, undefined, workspace);
      const plan: Plan = {
        _tag: "Plan",
        name: "Update managed files",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "first",
                run: protectWorkspacePath(target).pipe(
                  Effect.andThen(
                    fs
                      .writeFileString(target, "changed")
                      .pipe(
                        Effect.mapError((cause) =>
                          makeAppError({ code: "internal", detail: "write failed", cause }),
                        ),
                      ),
                  ),
                  Effect.as({ result: "success" as const, message: "changed" }),
                ),
              },
              {
                readiness: "ready",
                label: "second",
                run: Effect.succeed({
                  result: "error" as const,
                  message: "second step failed",
                  error: makeAppError({
                    code: "internal",
                    detail: "second step failed",
                    suggestions: [{ description: "Repair the failed step." }],
                  }),
                }),
              },
              {
                readiness: "ready",
                label: "third",
                run: Effect.succeed({ result: "success", message: "should not run" }),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));
      expect(result).toMatchObject({ _tag: "FailedPlan", reason: "execution-failed" });
      expect(result).toMatchObject({
        suggestions: [{ description: "Repair the failed step." }],
        executionSteps: [
          { label: "first", status: "rolled-back" },
          { label: "second", status: "failed" },
          { label: "third", status: "unapplied" },
        ],
      });
      expect(yield* fs.readFileString(target)).toBe("original");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
