import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

import {
  applyPlanExecution,
  promptablePlanExecution,
  preapprovedPlanExecution,
  previewPlanExecution,
  type ConfirmationRecovery,
} from "./plan-execution.js";
import { runWorkspaceTransaction } from "../operations/transaction.js";
import {
  acquireWorkspaceTransitionLock,
  isWorkspaceTransitionHeldByThisInvocation,
} from "../operations/transition-lock.js";
import {
  protectWorkspacePath,
  WorkspaceMutations,
  type WorkspaceMutationsService,
  type WorkspaceTransitionAcquirer,
} from "@agentxm/workspace-state";
import { ResolvePlanInteractionTest, type ApplyConfirmation } from "./resolve-plan-interaction.js";
import { makeBaseWorkspaceMock } from "@agentxm/workspace-state/testing";
import type { Plan } from "./plan.js";
import { StepFailure, type PlanInteractionFailed } from "./errors.js";
import { isExecutionCandidateFresh, makeExecutionCandidate } from "./execution-candidate.js";
import { deriveOperationOutcome } from "./operation-resolution.js";
import { workspaceTransactionFailureToStepFailure } from "./step-failure-conversions.js";
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
  confirmApplyChanges?: () => Effect.Effect<ApplyConfirmation, PlanInteractionFailed>,
  overrides?: { readonly confirmationAvailable?: boolean },
  workspace: WorkspaceMutationsService = makeBaseWorkspaceMock("/tmp/axm-preview/.axm"),
) => {
  const interaction = ResolvePlanInteractionTest({
    ...(overrides?.confirmationAvailable === undefined
      ? {}
      : { isConfirmationAvailable: overrides.confirmationAvailable }),
    ...(confirmApplyChanges === undefined ? {} : { confirmApplyChanges }),
  });

  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      Layer.succeed(WorkspaceMutations, workspace),
      interaction.layer,
    ),
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

      expect(context.interactionState.planningProgress).toEqual(["Install skill"]);
      expect(context.interactionState.applyProgress).toEqual(["Install skill"]);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("presents the candidate to the interaction for an apply without risk", () => {
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

      // The kernel presents unconditionally; the mode-aware wording gate
      // (no planned block without confirmable risk) is the CLI Live's.
      expect(context.interactionState.presentPlanCalls).toEqual([
        { planName: "Publish skill", mode: "apply" },
      ]);
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
            { extensionType: "skill", name: "code-review", plannedState: "enabled" },
          ],
        }),
      });

      // The settled closure's commit stands; the missing projection readback
      // is a truthful partial outcome, and the next sync converges it.
      expect(deriveOperationOutcome(result)).toBe("partial");
      expect(result.failure?.category).toBe("conflict");
      expect(result.failure?.detail).toContain("did not converge for claude-code");
      expect(result.units.map((unit) => unit.state)).toEqual(["committed"]);
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
            displayedBeforeConfirmation = context.interactionState.presentPlanCalls.some(
              (call) => call.mode === "apply",
            );
            return "declined" as const;
          }),
        { confirmationAvailable: true },
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
      expect(deriveOperationOutcome(result)).toBe("blocked");
      expect(result.blocking?.class).toBe("precondition-unmet");
      expect(result.blocking?.causeCode).toBe("conflict");
      expect(result.blocking?.subject).toBe("invalid");
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
      const withoutEvidence = yield* makeExecutionCandidate(base, {
        settingsPath: "/tmp/axm-candidate/axm.json",
        lockPath: "/tmp/axm-candidate/axm-lock.yaml",
        baseDir: "/tmp",
      });
      const withEvidence = yield* makeExecutionCandidate(
        { ...base, releaseAge },
        {
          settingsPath: "/tmp/axm-candidate/axm.json",
          lockPath: "/tmp/axm-candidate/axm-lock.yaml",
          baseDir: "/tmp",
        },
      );

      expect(withEvidence.id).not.toBe(withoutEvidence.id);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fingerprints the layout's exact settings and lock paths", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-layout-material-" });
      const settingsPath = `${directory}/axm.json`;
      const lockPath = `${directory}/axm-lock.yaml`;
      yield* fs.writeFileString(settingsPath, "{}");
      yield* fs.writeFileString(lockPath, "lockfileVersion: 7\nskills: {}\n");
      const plan: Plan = {
        _tag: "Plan",
        name: "Layout material",
        description: Option.none(),
        jobs: [{ concurrency: 1, steps: [] }],
      };
      const candidate = yield* makeExecutionCandidate(plan, {
        settingsPath,
        lockPath,
        baseDir: directory,
      });

      expect(candidate.materialPaths).toEqual([lockPath, settingsPath].sort());
      yield* fs.writeFileString(settingsPath, '{"agents":[]}');
      expect(yield* isExecutionCandidateFresh(candidate)).toBe(false);
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
      expect(deriveOperationOutcome(rejected)).toBe("blocked");
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
        () =>
          fs.writeFileString(material, "after").pipe(Effect.as("approved" as const), Effect.orDie),
        { confirmationAvailable: true },
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
          fs.writeFileString(material, "changed-after-authorization").pipe(
            Effect.mapError(
              (cause) =>
                new StepFailure({
                  category: "internal",
                  detail: "Failed to mutate test material",
                  cause,
                }),
            ),
          ),
      }).pipe(Effect.provide(context.layer));

      expect(deriveOperationOutcome(result)).toBe("blocked");
      expect(result.blocking?.class).toBe("stale-candidate");
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "C-06: a failed closure in a fail-fast job rolls back itself and blocks dependents",
    () =>
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
                    Effect.mapError(workspaceTransactionFailureToStepFailure),
                    Effect.andThen(
                      fs.writeFileString(target, "changed").pipe(
                        Effect.mapError(
                          (cause) =>
                            new StepFailure({
                              category: "internal",
                              detail: "write failed",
                              cause,
                            }),
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
                    error: new StepFailure({
                      category: "internal",
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

        // Closures settle independently: the settled first closure stands, the
        // failed closure rolled back only itself, and the dependent third step
        // is blocked truthfully. Mixed commits and failures yield partial.
        expect(deriveOperationOutcome(result)).toBe("partial");
        expect(result.failure?.detail).toBe("second step failed");
        expect(result.atomicity).toEqual({
          declared: "closure-atomic",
          applied: "closure-atomic",
        });
        expect(result.suggestions).toEqual([{ description: "Repair the failed step." }]);
        expect(result.units.map((unit) => [unit.id, unit.state])).toEqual([
          ["first", "committed"],
          ["second", "failed"],
          ["third", "blocked"],
        ]);
        expect(result.units[0]?.disposition).toBeUndefined();
        expect(result.units[1]?.disposition).toBe("restored");
        expect(result.units[2]?.blocking?.class).toBe("operation-aborted");
        expect(result.units[2]?.blocking?.reference).toBe("second");
        // The first closure's commit survives; nothing of the failed closure
        // remains.
        expect(yield* fs.readFileString(target)).toBe("changed");
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("C-06: a failed closure rolls back only itself while ready closures continue", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-closure-" });
      const workspaceDir = path.join(directory, ".axm");
      const fileA = path.join(directory, "a.txt");
      const fileB = path.join(directory, "b.txt");
      const fileC = path.join(directory, "c.txt");
      yield* fs.writeFileString(fileA, "a-original");
      yield* fs.writeFileString(fileB, "b-original");
      yield* fs.writeFileString(fileC, "c-original");
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
      const write = (target: string, content: string) =>
        protectWorkspacePath(target).pipe(
          Effect.mapError(workspaceTransactionFailureToStepFailure),
          Effect.andThen(
            fs
              .writeFileString(target, content)
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new StepFailure({ category: "internal", detail: "write failed", cause }),
                ),
              ),
          ),
        );
      const plan: Plan = {
        _tag: "Plan",
        name: "Update independent extensions",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            executionPolicy: "best-effort",
            steps: [
              {
                readiness: "ready",
                key: "skill:a",
                label: "a",
                run: write(fileA, "a-changed").pipe(
                  Effect.as({ result: "success" as const, message: "updated" }),
                ),
              },
              {
                readiness: "ready",
                key: "skill:b",
                label: "b",
                run: write(fileB, "b-changed").pipe(
                  Effect.as({
                    result: "error" as const,
                    message: "b failed after writing",
                    error: new StepFailure({
                      category: "internal",
                      detail: "b failed after writing",
                    }),
                  }),
                ),
              },
              {
                readiness: "ready",
                key: "skill:c",
                label: "c",
                run: write(fileC, "c-changed").pipe(
                  Effect.as({ result: "success" as const, message: "updated" }),
                ),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));

      expect(deriveOperationOutcome(result)).toBe("partial");
      expect(result.units.map((unit) => [unit.id, unit.state])).toEqual([
        ["skill:a", "committed"],
        ["skill:b", "failed"],
        ["skill:c", "committed"],
      ]);
      expect(result.units[1]?.disposition).toBe("restored");
      // Settled closures stand; only the failed closure was restored.
      expect(yield* fs.readFileString(fileA)).toBe("a-changed");
      expect(yield* fs.readFileString(fileB)).toBe("b-original");
      expect(yield* fs.readFileString(fileC)).toBe("c-changed");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("C-15: interruption mid-apply restores only the in-flight closure", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-closure-int-" });
      const workspaceDir = path.join(directory, ".axm");
      const fileA = path.join(directory, "a.txt");
      const fileB = path.join(directory, "b.txt");
      yield* fs.writeFileString(fileA, "a-original");
      yield* fs.writeFileString(fileB, "b-original");
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
      const inFlight = yield* Deferred.make<void>();
      const plan: Plan = {
        _tag: "Plan",
        name: "Update extensions",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                key: "skill:a",
                label: "a",
                run: protectWorkspacePath(fileA).pipe(
                  Effect.mapError(workspaceTransactionFailureToStepFailure),
                  Effect.andThen(
                    fs.writeFileString(fileA, "a-changed").pipe(
                      Effect.mapError(
                        (cause) =>
                          new StepFailure({
                            category: "internal",
                            detail: "write failed",
                            cause,
                          }),
                      ),
                    ),
                  ),
                  Effect.as({ result: "success" as const, message: "updated" }),
                ),
              },
              {
                readiness: "ready",
                key: "skill:b",
                label: "b",
                run: protectWorkspacePath(fileB).pipe(
                  Effect.mapError(workspaceTransactionFailureToStepFailure),
                  Effect.andThen(
                    fs.writeFileString(fileB, "b-changed").pipe(
                      Effect.mapError(
                        (cause) =>
                          new StepFailure({
                            category: "internal",
                            detail: "write failed",
                            cause,
                          }),
                      ),
                    ),
                  ),
                  Effect.andThen(Deferred.succeed(inFlight, void 0)),
                  Effect.andThen(Effect.never),
                  Effect.as({ result: "success" as const, message: "updated" }),
                ),
              },
            ],
          },
        ],
      };

      const fiber = yield* Effect.forkChild(
        previewOrApplyPlan(plan, { execution: preapprovedPlanExecution }).pipe(
          Effect.provide(context.layer),
        ),
      );
      yield* Deferred.await(inFlight);
      yield* Fiber.interrupt(fiber);
      // The settled first closure stands; the in-flight closure was restored.
      expect(yield* fs.readFileString(fileA)).toBe("a-changed");
      expect(yield* fs.readFileString(fileB)).toBe("b-original");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  // Restoration failure is a typed fact on the transaction's error channel:
  // the resolution derives the retained set, dispositions, atomicity, and
  // exit from that value alone. The pre-change snapshots survive in
  // OS-temporary storage, and nothing persists in the workspace.
  it.effect("C-07: reports retained state and preserved snapshots when restoration fails", () =>
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
                run: Effect.succeed({ result: "success" as const, message: "unrelated commit" }),
              },
              {
                readiness: "ready",
                label: "second",
                // The failing closure mutated the target and then made its
                // own restoration impossible: the parent directory is
                // replaced by a plain file before the step reports failure.
                run: protectWorkspacePath(target).pipe(
                  Effect.mapError(workspaceTransactionFailureToStepFailure),
                  Effect.andThen(fs.writeFileString(target, "changed").pipe(Effect.orDie)),
                  Effect.andThen(fs.rename(managedDir, movedDir).pipe(Effect.orDie)),
                  Effect.andThen(
                    fs.writeFileString(managedDir, "blocks restoration").pipe(Effect.orDie),
                  ),
                  Effect.as({
                    result: "error" as const,
                    message: "second step failed",
                    error: new StepFailure({ category: "internal", detail: "second step failed" }),
                  }),
                ),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));

      // The failed closure's effects survive unrestored: partial, nonzero
      // exit, retained disposition on that closure, non-rollbackable applied
      // atomicity — while the settled first closure stands as an ordinary
      // commit.
      expect(deriveOperationOutcome(result)).toBe("partial");
      expect(result.atomicity.applied).toBe("non-rollbackable");
      expect(result.units.find((unit) => unit.id === "first")?.state).toBe("committed");
      expect(result.units.find((unit) => unit.id === "second")?.state).toBe("failed");
      expect(result.units.find((unit) => unit.id === "second")?.disposition).toBe("retained");
      expect(result.recovery?.retained).toEqual([path.join("managed", "managed.txt")]);
      // The pre-change snapshots survive outside the workspace, in
      // OS-temporary storage, and the recovery content names them.
      const snapshotDir = result.recovery?.snapshotDir ?? "";
      expect(snapshotDir.length).toBeGreaterThan(0);
      expect(snapshotDir.startsWith(directory)).toBe(false);
      expect(yield* fs.readFileString(path.join(snapshotDir, "0.snap"))).toBe("original");
      // Nothing persists in the workspace: no capsule, record, or marker.
      expect(yield* fs.exists(path.join(workspaceDir, "tmp", "recovery"))).toBe(false);
      expect(yield* fs.exists(path.join(workspaceDir, "operations"))).toBe(false);
      yield* fs.remove(snapshotDir, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  // Nothing about a restoration failure persists in the workspace: the next
  // ordinary mutation resolves owned transient state and converges from
  // surviving authority — no recovery flag, command-intent record, or repair
  // workflow.
  it.effect("C-07: a later apply converges ordinarily after a restoration failure", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-recovery-converge-" });
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
                  Effect.mapError(workspaceTransactionFailureToStepFailure),
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
                  error: new StepFailure({ category: "internal", detail: "second step failed" }),
                }),
              },
            ],
          },
        ],
      };

      const first = yield* previewOrApplyPlan(failingPlan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));
      expect(deriveOperationOutcome(first)).toBe("partial");
      const snapshotDir = first.recovery?.snapshotDir;

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

      // The follow-up needs no flag, consents to nothing, and repairs
      // nothing: it converges from the current workspace state.
      expect(deriveOperationOutcome(second)).toBe("applied");
      expect(second.recovery).toBeUndefined();
      expect(yield* fs.exists(otherTarget)).toBe(true);
      expect(yield* fs.exists(path.join(workspaceDir, "tmp", "recovery"))).toBe(false);
      expect(yield* fs.exists(path.join(workspaceDir, "operations"))).toBe(false);
      if (snapshotDir !== undefined) {
        yield* fs.remove(snapshotDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  // Lock lifetime: the workspace transition is acquired after confirmation,
  // held through revalidation and apply, and released with the resolution.
  it.effect("C-20: acquires the workspace transition for apply and releases it after", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-lock-lifetime-" });
      const workspaceDir = path.join(directory, ".axm");
      yield* fs.makeDirectory(workspaceDir, { recursive: true });
      const resolved = path.resolve(workspaceDir);
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      const heldDuringApply: Array<boolean> = [];
      const lockOnDisk: Array<boolean> = [];
      const semaphore = Semaphore.makeUnsafe(1);
      const baseWorkspace = makeBaseWorkspaceMock(workspaceDir);
      const workspace: WorkspaceMutationsService = {
        ...baseWorkspace,
        acquireTransition: (request) =>
          acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: {
              command: request.command,
              pid: process.pid,
              ...(request.candidateId === undefined ? {} : { candidateId: request.candidateId }),
            },
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
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
        name: "Observe the transition hold",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "observe",
                run: Effect.gen(function* () {
                  heldDuringApply.push(isWorkspaceTransitionHeldByThisInvocation(resolved));
                  lockOnDisk.push(yield* fs.exists(lockPath).pipe(Effect.orDie));
                  return { result: "success" as const, message: "observed" };
                }),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));

      expect(deriveOperationOutcome(result)).toBe("applied");
      expect(heldDuringApply).toEqual([true]);
      expect(lockOnDisk).toEqual([true]);
      expect(isWorkspaceTransitionHeldByThisInvocation(resolved)).toBe(false);
      expect(yield* fs.exists(lockPath)).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("C-20: preview never requests the workspace transition", () =>
    Effect.gen(function* () {
      let acquisitions = 0;
      const counting: WorkspaceTransitionAcquirer = () =>
        Effect.sync(() => {
          acquisitions += 1;
          return Option.none();
        });
      const workspace: WorkspaceMutationsService = {
        ...makeBaseWorkspaceMock("/tmp/axm-preview/.axm"),
        acquireTransition: counting,
      };
      const context = makeTestContext(undefined, undefined, workspace);
      const plan: Plan = {
        _tag: "Plan",
        name: "Preview only",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "would-write",
                run: Effect.succeed({ result: "success" as const, message: "never runs" }),
              },
            ],
          },
        ],
      };

      const previewed = yield* previewOrApplyPlan(plan, {
        execution: previewPlanExecution,
      }).pipe(Effect.provide(context.layer));
      expect(deriveOperationOutcome(previewed)).toBe("previewed");
      expect(acquisitions).toBe(0);

      const applied = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));
      expect(deriveOperationOutcome(applied)).toBe("applied");
      expect(acquisitions).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("C-20: contention terminates blocked with the holder reference", () =>
    Effect.gen(function* () {
      const contended: WorkspaceTransitionAcquirer = () =>
        Effect.succeed(
          Option.some({
            holder: Option.some({ command: "install", pid: 1234 }),
            waitedMillis: 60_000,
          }),
        );
      const workspace: WorkspaceMutationsService = {
        ...makeBaseWorkspaceMock("/tmp/axm-preview/.axm"),
        acquireTransition: contended,
      };
      const context = makeTestContext(undefined, undefined, workspace);
      const plan: Plan = {
        _tag: "Plan",
        name: "Contended apply",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "never-runs",
                run: Effect.succeed({ result: "success" as const, message: "never runs" }),
              },
            ],
          },
        ],
      };

      const result = yield* previewOrApplyPlan(plan, {
        execution: preapprovedPlanExecution,
      }).pipe(Effect.provide(context.layer));

      expect(deriveOperationOutcome(result)).toBe("blocked");
      expect(result.blocking?.class).toBe("resource-conflict");
      expect(result.blocking?.reference).toBe("install (pid 1234)");
      expect(result.blocking?.detail).toContain("waited 60s");
      expect(result.units.every((unit) => unit.state === "ready")).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
