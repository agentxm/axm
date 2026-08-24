import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

import { makeAppError } from "../app-error/index.js";
import { resolveRecoveryFlag, TestFlagsLayer } from "../cli-flags/index.js";
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
import { deriveOperationOutcome, operationExitCode } from "./operation-resolution.js";
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

      expect(result._tag).toBe("OperationResolution");
      expect(result.mode).toBe("preview");
      expect(deriveOperationOutcome(result)).toBe("previewed");
      expect(operationExitCode(result)).toBe(0);
      expect(result.units.map((unit) => unit.state)).toEqual(["ready"]);
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

  it.effect("renders no planned block for an apply without confirmable risk", () => {
    const context = makeTestContext();
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
          (entry) => entry.message.includes("Would") || entry.message.includes("Ready to"),
        ),
      ).toBe(false);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("C-12: applies an eligible explicit mutation without prompting", () => {
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

      expect(deriveOperationOutcome(result)).toBe("applied");
      expect(result.mode).toBe("apply");
      expect(result.candidateId).toBeDefined();
      expect(result.units.map((unit) => unit.state)).toEqual(["committed"]);
      expect(result.releaseAge).toEqual(releaseAge);
      expect(appliedCount).toBe(1);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("fails an applied mutation when required agent projection readback is missing", () => {
    const workspace = makeBaseWorkspaceMock("/tmp/axm-preview/.axm", {
      getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    });
    const context = makeTestContext(undefined, undefined, workspace);
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skill",
      description: Option.none(),
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
      const result = yield* previewOrApplyPlan(plan, {
        execution: applyPlanExecution({
          approval: "preapproved",
          recovery: testRecovery,
          configuredAgentOperations: [
            { extensionType: "skill", name: "code-review", targetEnabled: true },
          ],
        }),
      });

      expect(deriveOperationOutcome(result)).toBe("failed");
      expect(result.failure?.code).toBe("conflict");
      expect(result.failure?.detail).toContain("did not converge for claude-code");
      expect(result.units.map((unit) => unit.state)).toEqual(["rolled-back"]);
      expect(result.units[0]?.disposition).toBe("restored");
    }).pipe(Effect.provide(context.layer));
  });

  it.effect(
    "C-16: displays confirmable risk before confirmation and cancels without execution",
    () => {
      let appliedCount = 0;
      let displayedBeforeConfirmation = false;
      const context = makeTestContext(
        () =>
          Effect.sync(() => {
            displayedBeforeConfirmation = context.rendererState.logs.some(
              (entry) => entry._tag === "info" && entry.message.includes("Ready to apply"),
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

        expect(result.declined).toBe(true);
        expect(deriveOperationOutcome(result)).toBe("cancelled");
        expect(operationExitCode(result)).toBe(0);
        expect(result.releaseAge).toEqual(releaseAge);
        expect(displayedBeforeConfirmation).toBe(true);
        expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(1);
        expect(appliedCount).toBe(0);
      }).pipe(Effect.provide(context.layer));
    },
  );

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

      expect(deriveOperationOutcome(result)).toBe("blocked");
      expect(result.blocking?.class).toBe("precondition-unmet");
      expect(result.blocking?.causeCode).toBe("conflict");
      expect(result.blocking?.subject).toBe("invalid");
      expect(operationExitCode(result)).toBe(6);
      expect(result.releaseAge).toEqual(releaseAge);
      expect(result.units.map((unit) => unit.state)).toEqual(["ready", "blocked"]);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("C-13: does not prompt for an empty no-op plan", () => {
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

      expect(result._tag).toBe("OperationResolution");
      expect(deriveOperationOutcome(result)).toBe("no-op");
      expect(operationExitCode(result)).toBe(0);
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

  it.effect(
    "C-19: requires deterministic approval for confirmable risk in non-interactive mode",
    () => {
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

        expect(deriveOperationOutcome(result)).toBe("blocked");
        expect(result.blocking?.class).toBe("approval-required");
        expect(result.blocking?.escape).toBeDefined();
        expect(result.blocking?.escape?.cmd).toContain("--yes");
        expect(operationExitCode(result)).toBe(2);
        expect(appliedCount).toBe(0);
      }).pipe(Effect.provide(context.layer));
    },
  );

  it.effect("does not let --yes accept a named policy override", () => {
    let appliedCount = 0;
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Accept warnings",
      description: Option.none(),
      riskConditions: [
        {
          level: "override-required",
          id: "installed-dependents",
          policy: "accept-warnings",
          requiredFlag: "--accept-warnings",
          detail: "The plan has unresolved warnings",
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
      expect(deriveOperationOutcome(rejected)).toBe("blocked");
      expect(rejected.blocking?.class).toBe("override-required");
      expect(rejected.blocking?.escape?.description).toContain("--accept-warnings");
      expect(operationExitCode(rejected)).toBe(2);
      expect(appliedCount).toBe(0);

      const accepted = yield* previewOrApplyPlan(plan, {
        execution: applyPlanExecution({
          approval: "prompt-if-interactive",
          acceptedPolicies: new Set(["accept-warnings"]),
          recovery: testRecovery,
        }),
      });
      expect(deriveOperationOutcome(accepted)).toBe("applied");
      expect(accepted.units.map((unit) => unit.state)).toEqual(["committed"]);
      expect(appliedCount).toBe(1);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("C-02: fails a candidate that changes after display without applying it", () =>
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
      expect(deriveOperationOutcome(result)).toBe("blocked");
      expect(result.blocking?.class).toBe("stale-candidate");
      expect(result.blocking?.escape?.description).toContain("Rerun the command");
      expect(operationExitCode(result)).toBe(6);
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("C-02: revalidates material after a delayed pre-apply gate", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-post-auth-" });
      const material = `${directory}/manifest.json`;
      yield* fs.writeFileString(material, "authorized");
      let appliedCount = 0;
      const context = makeTestContext(
        undefined,
        undefined,
        makeBaseWorkspaceMock(`${directory}/.axm`),
      );
      const plan: Plan = {
        _tag: "Plan",
        name: "Publish package",
        description: Option.none(),
        materialPaths: [material],
        executionCapabilities: { rollback: "non-rollbackable" },
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "publish",
                run: Effect.sync(() => {
                  appliedCount += 1;
                  return { result: "success" as const, message: "published" };
                }),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
        beforeApply: () =>
          fs
            .writeFileString(material, "changed-after-authorization")
            .pipe(
              Effect.mapError((cause) =>
                makeAppError({ code: "internal", detail: "Failed to mutate test material", cause }),
              ),
            ),
      }).pipe(Effect.provide(context.layer));

      expect(deriveOperationOutcome(result)).toBe("blocked");
      expect(result.blocking?.class).toBe("stale-candidate");
      expect(operationExitCode(result)).toBe(6);
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("C-06: rolls back the complete local candidate when a later step fails", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-rollback-" });
      const workspaceDir = path.join(directory, ".axm");
      const target = path.join(directory, "managed.txt");
      yield* fs.writeFileString(target, "original");
      const baseWorkspace = makeBaseWorkspaceMock(workspaceDir);
      const semaphore = Semaphore.makeUnsafe(1);
      const workspace: WorkspaceMutationsService = {
        ...baseWorkspace,
        runTransaction: (args) =>
          runWorkspaceTransaction({
            semaphore,
            workspaceDir,
            targets: args.targets ?? [],
            transition: args.transition,
            validate: args.validate,
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

      expect(deriveOperationOutcome(result)).toBe("failed");
      expect(result.failure?.detail).toBe("second step failed");
      expect(result.atomicity).toEqual({
        declared: "candidate-atomic",
        applied: "candidate-atomic",
      });
      expect(result.suggestions).toEqual([{ description: "Repair the failed step." }]);
      expect(result.units.map((unit) => [unit.id, unit.state])).toEqual([
        ["first", "rolled-back"],
        ["second", "failed"],
        ["third", "blocked"],
      ]);
      expect(result.units[0]?.disposition).toBe("restored");
      expect(result.units[1]?.disposition).toBe("restored");
      expect(result.units[2]?.disposition).toBe("untouched");
      expect(result.units[2]?.blocking?.class).toBe("operation-aborted");
      expect(result.units[2]?.blocking?.reference).toBe("second");
      expect(yield* fs.readFileString(target)).toBe("original");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  // Restoration failure is a typed fact on the transaction's error channel:
  // the resolution derives `recovery-required`, the retained set, and exit 6
  // from that value alone, with the recovery capsule as the surviving
  // recovery content. Formerly an expected-failure pin against the inference
  // that re-read recovery records from the workspace.
  it.effect("C-07: reports recovery-required when restoration fails", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-restore-fail-" });
      const workspaceDir = path.join(directory, ".axm");
      yield* fs.makeDirectory(workspaceDir, { recursive: true });
      const managedDir = path.join(directory, "managed");
      const movedDir = `${managedDir}-moved`;
      const target = path.join(managedDir, "managed.txt");
      yield* fs.makeDirectory(managedDir, { recursive: true });
      yield* fs.writeFileString(target, "original");
      const semaphore = Semaphore.makeUnsafe(1);
      const baseWorkspace = makeBaseWorkspaceMock(workspaceDir);
      const workspace: WorkspaceMutationsService = {
        ...baseWorkspace,
        runTransaction: (args) =>
          runWorkspaceTransaction({
            semaphore,
            workspaceDir,
            targets: args.targets ?? [],
            transition: args.transition,
            validate: args.validate,
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
                  Effect.andThen(fs.writeFileString(target, "changed").pipe(Effect.orDie)),
                  // Restoration cannot recreate the target afterwards: its
                  // parent directory is replaced by a plain file.
                  Effect.andThen(fs.rename(managedDir, movedDir).pipe(Effect.orDie)),
                  Effect.andThen(
                    fs.writeFileString(managedDir, "blocks restoration").pipe(Effect.orDie),
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
                  error: makeAppError({ code: "internal", detail: "second step failed" }),
                }),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));

      expect(deriveOperationOutcome(result)).toBe("recovery-required");
      expect(operationExitCode(result)).toBe(6);
      expect(result.recovery?.blocksNormalOperation).toBe(true);
      expect(result.recovery?.retained.length ?? 0).toBeGreaterThan(0);
      // The machine-visible recovery content names the capsule, which
      // persists with its snapshots inside the transient location.
      expect(result.recovery?.recordPath ?? "").toContain(path.join(".axm", "tmp", "recovery"));
      const capsuleDir = path.join(directory, result.recovery?.recordPath ?? "");
      expect(yield* fs.exists(path.join(capsuleDir, "capsule.json"))).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  // A prior restoration failure stays blocking for every later
  // mutation-class apply until resolved: detection finds the live capsule and
  // terminates `recovery-required` before touching anything. The retained
  // state is deliberately tampered with between the runs so no automatic
  // restoration may legitimately continue either. Formerly an
  // expected-failure pin against the non-blocking warning and the
  // bulk-resolution of open records by any successful apply.
  it.effect("C-07: blocks a later apply while a restoration failure remains unresolved", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-recovery-block-" });
      const workspaceDir = path.join(directory, ".axm");
      yield* fs.makeDirectory(workspaceDir, { recursive: true });
      const managedDir = path.join(directory, "managed");
      const movedDir = `${managedDir}-moved`;
      const target = path.join(managedDir, "managed.txt");
      yield* fs.makeDirectory(managedDir, { recursive: true });
      yield* fs.writeFileString(target, "original");
      const semaphore = Semaphore.makeUnsafe(1);
      const baseWorkspace = makeBaseWorkspaceMock(workspaceDir);
      const workspace: WorkspaceMutationsService = {
        ...baseWorkspace,
        runTransaction: (args) =>
          runWorkspaceTransaction({
            semaphore,
            workspaceDir,
            targets: args.targets ?? [],
            transition: args.transition,
            validate: args.validate,
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
      };
      const context = makeTestContext(undefined, undefined, workspace);
      const failingPlan: Plan = {
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
                  Effect.andThen(fs.writeFileString(target, "changed").pipe(Effect.orDie)),
                  // Restoration cannot recreate the target afterwards: its
                  // parent directory is replaced by a plain file.
                  Effect.andThen(fs.rename(managedDir, movedDir).pipe(Effect.orDie)),
                  Effect.andThen(
                    fs.writeFileString(managedDir, "blocks restoration").pipe(Effect.orDie),
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
                  error: makeAppError({ code: "internal", detail: "second step failed" }),
                }),
              },
            ],
          },
        ],
      };

      const first = yield* previewOrApplyPlan(failingPlan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));
      expect(deriveOperationOutcome(first)).toBe("recovery-required");

      // Tamper with the retained state so no automatic restoration can
      // legitimately proceed: the failed region now holds bytes the failure
      // never recorded.
      yield* fs.remove(managedDir, { force: true });
      yield* fs.makeDirectory(managedDir, { recursive: true });
      yield* fs.writeFileString(target, "tampered");

      const otherTarget = path.join(directory, "other.txt");
      const followUp: Plan = {
        _tag: "Plan",
        name: "Write unrelated file",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "write-other",
                run: fs
                  .writeFileString(otherTarget, "unrelated")
                  .pipe(
                    Effect.orDie,
                    Effect.as({ result: "success" as const, message: "written" }),
                  ),
              },
            ],
          },
        ],
      };

      const second = yield* previewOrApplyPlan(followUp, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));

      expect(deriveOperationOutcome(second)).toBe("recovery-required");
      expect(operationExitCode(second)).toBe(6);
      expect(second.recovery?.blocksNormalOperation).toBe(true);
      expect(yield* fs.exists(otherTarget)).toBe(false);

      // The one-shot consent flag resolves the condition: accepting the
      // retained state removes the capsule and the apply proceeds.
      const accepted = yield* previewOrApplyPlan(followUp, {
        execution: preapprovedPlanExecution,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(context.layer, Layer.succeed(resolveRecoveryFlag, Option.some("accept"))),
        ),
      );
      expect(deriveOperationOutcome(accepted)).toBe("applied");
      expect(yield* fs.exists(otherTarget)).toBe(true);
      expect(yield* fs.exists(path.join(workspaceDir, "tmp", "recovery"))).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  // Fail-closed detection: recovery state that cannot be interpreted is a
  // blocking conflict, never evidence of absence.
  it.effect("C-07: an uninterpretable capsule blocks a later apply", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-recovery-garbage-" });
      const workspaceDir = path.join(directory, ".axm");
      const capsuleDir = path.join(workspaceDir, "tmp", "recovery", "unknown-capsule");
      yield* fs.makeDirectory(capsuleDir, { recursive: true });
      yield* fs.writeFileString(path.join(capsuleDir, "capsule.json"), "{not json");
      const context = makeTestContext(undefined, undefined, makeBaseWorkspaceMock(workspaceDir));
      const target = path.join(directory, "other.txt");
      const plan: Plan = {
        _tag: "Plan",
        name: "Write unrelated file",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "write-other",
                run: fs
                  .writeFileString(target, "unrelated")
                  .pipe(
                    Effect.orDie,
                    Effect.as({ result: "success" as const, message: "written" }),
                  ),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));

      expect(deriveOperationOutcome(result)).toBe("recovery-required");
      expect(operationExitCode(result)).toBe(6);
      expect(yield* fs.exists(target)).toBe(false);
      // Consent to restore cannot apply to state without snapshots.
      const restoreAttempt = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(context.layer, Layer.succeed(resolveRecoveryFlag, Option.some("restore"))),
        ),
      );
      expect(deriveOperationOutcome(restoreAttempt)).toBe("recovery-required");
      expect(yield* fs.exists(target)).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
