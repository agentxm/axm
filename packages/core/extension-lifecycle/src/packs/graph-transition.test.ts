import { lifecycleStepFailure } from "../step-failure.js";
import { buildReconciliationClosure } from "@agentxm/workspace-reconciliation";
import * as fs from "node:fs";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  StepFailure,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type JobStepResult,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";
import { protectWorkspacePath } from "@agentxm/workspace-transactions";

import { ExtensionLifecycleFailed } from "../errors.js";
import { installRefused, type InstallStepRequirements } from "../install/vocabulary.js";
import { makeLifecycleFixture, type LifecycleFixture } from "../testing.js";
import { makeWorkspaceUpdatePlan } from "../update/configured.js";
import {} from "./graph-transition.js";

/**
 * Register a target with the enclosing transition before writing it, the way
 * every workspace writer does, so the transaction can restore it.
 */
const protectedWrite = (target: string, contents: string): Effect.Effect<void, StepFailure> =>
  protectWorkspacePath(target).pipe(
    Effect.mapError(
      (cause) =>
        new StepFailure({
          category: "internal",
          detail: `Could not protect ${target} before writing it`,
          cause,
        }),
    ),
    Effect.flatMap(() =>
      Effect.sync(() => {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, contents);
      }),
    ),
  );

describe("atomic pack graph transition", () => {
  let workspace: LifecycleFixture;

  beforeEach(() => {
    workspace = makeLifecycleFixture({ settings: { owner: "@test", agents: [] } });
  });

  afterEach(() => {
    workspace.cleanup();
  });

  /** The workspace, its transaction scope, and the platform, over the temp root. */
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));

  it.effect("rolls back the complete graph when every possible member position fails", () =>
    provide(
      Effect.gen(function* () {
        const targets = ["pack", "skill", "command"].map((name) =>
          path.join(workspace.root, "agent_extensions", name, "content.txt"),
        );

        for (const failAt of targets.keys()) {
          for (const target of targets) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, "before\n");
          }

          const childSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> = targets.map(
            (target, index) => ({
              readiness: "ready",
              label: `member-${String(index)}`,
              run: protectedWrite(target, `after-${String(index)}\n`).pipe(
                Effect.map(() =>
                  index === failAt
                    ? ({
                        result: "error",
                        message: `injected failure at ${String(index)}`,
                        error: new StepFailure({
                          category: "internal",
                          detail: `injected failure at ${String(index)}`,
                        }),
                      } satisfies JobStepResult)
                    : ({
                        result: "success",
                        message: `updated member ${String(index)}`,
                      } satisfies JobStepResult),
                ),
              ),
            }),
          );
          const graphStep = yield* buildReconciliationClosure({
            toStepFailure: lifecycleStepFailure,
            label: "@test/packs/atomic",
            message: "updated atomic pack graph",
            artifact: {
              path: "pack graph",
              scope: "project",
              change: "updated",
            },
            children: childSteps.map((step) => ({ step, coverage: "ineligible" as const })),
            validate: Effect.void,
          });
          if (graphStep.readiness === "error") {
            return yield* installRefused({
              category: "internal",
              detail: graphStep.errorMessage,
            });
          }

          const error = yield* Effect.flip(graphStep.run);
          expect(error.detail).toBe(`injected failure at ${String(failAt)}`);
          for (const target of targets) {
            expect(fs.readFileSync(target, "utf8")).toBe("before\n");
          }
        }
      }),
    ),
  );

  it.effect("isolates a failed Pack closure from an independent successful update", () =>
    provide(
      Effect.gen(function* () {
        const failedTarget = path.join(workspace.root, "agent_extensions", "failed", "content.txt");
        const healthyTarget = path.join(
          workspace.root,
          "agent_extensions",
          "healthy",
          "content.txt",
        );
        for (const target of [failedTarget, healthyTarget]) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, "before\n");
        }

        const makeClosure = (
          label: string,
          target: string,
          validate: Effect.Effect<void, ExtensionLifecycleFailed>,
        ) =>
          buildReconciliationClosure({
            toStepFailure: lifecycleStepFailure,
            label,
            message: `Updated ${label}`,
            artifact: { path: target, scope: "project", change: "updated" },
            children: [
              {
                coverage: "ineligible",
                step: {
                  readiness: "ready",
                  label: `${label} member`,
                  run: protectedWrite(target, "after\n").pipe(
                    Effect.map(
                      () =>
                        ({
                          result: "success",
                          message: `Updated ${label} member`,
                        }) satisfies JobStepResult,
                    ),
                  ),
                },
              },
            ],
            validate,
          });

        const failed = yield* makeClosure(
          "@test/packs/failed",
          failedTarget,
          Effect.fail(
            installRefused({
              category: "internal",
              detail:
                "Pack graph closure @test/packs/failed failed its desired-state predicate: expected activation disabled; observed activation enabled",
            }),
          ),
        );
        const healthy = yield* makeClosure("@test/packs/healthy", healthyTarget, Effect.void);
        const plan = makeWorkspaceUpdatePlan(
          "Update configured extensions",
          Option.none(),
          [failed, healthy],
          Option.none(),
          undefined,
        );

        const candidate = yield* prepareExecutionCandidate(plan);
        const resolution = yield* resolveExecutionCandidate(candidate, preapprovedPlanExecution);
        expect(resolution).toMatchObject({
          _tag: "OperationResolution",
          mode: "apply",
          atomicity: { declared: "non-rollbackable", applied: "non-rollbackable" },
          units: [
            {
              id: "@test/packs/failed",
              label: "@test/packs/failed",
              state: "failed",
              message: expect.stringContaining(
                "expected activation disabled; observed activation enabled",
              ),
            },
            {
              id: "@test/packs/healthy",
              label: "@test/packs/healthy",
              state: "committed",
            },
          ],
        });
        expect(fs.readFileSync(failedTarget, "utf8")).toBe("before\n");
        expect(fs.readFileSync(healthyTarget, "utf8")).toBe("after\n");
      }),
    ),
  );

  it.effect("runs the destructive precondition before every child step", () =>
    provide(
      Effect.gen(function* () {
        let childRan = false;
        const graphStep = yield* buildReconciliationClosure({
          toStepFailure: lifecycleStepFailure,
          label: "@test/packs/preconditioned",
          message: "updated preconditioned pack graph",
          artifact: {
            path: "pack graph",
            scope: "project",
            change: "updated",
          },
          children: [
            {
              coverage: "ineligible",
              step: {
                readiness: "ready",
                label: "child",
                run: Effect.sync(() => {
                  childRan = true;
                  return {
                    result: "success",
                    message: "child ran",
                  } satisfies JobStepResult;
                }),
              },
            },
          ],
          preTransition: Effect.fail(
            installRefused({
              category: "conflict",
              detail: "selected pack changed",
            }),
          ),
          validate: Effect.void,
        });
        if (graphStep.readiness === "error") {
          return yield* installRefused({
            category: "internal",
            detail: graphStep.errorMessage,
          });
        }

        const error = yield* Effect.flip(graphStep.run);
        expect(error.category).toBe("conflict");
        expect(childRan).toBe(false);
      }),
    ),
  );

  it.effect("publishes the deterministic union from successful eligible install leaves", () =>
    provide(
      Effect.gen(function* () {
        const graphStep = yield* buildReconciliationClosure({
          toStepFailure: lifecycleStepFailure,
          label: "@test/packs/covered",
          message: "installed covered pack",
          artifact: {
            path: "pack graph",
            scope: "project",
            change: "updated",
            fileCount: 1,
            targets: [{ path: "agent_extensions/@test/packs/covered", change: "created" }],
          },
          children: [
            {
              coverage: "eligible",
              step: {
                readiness: "ready",
                label: "skill:a",
                run: Effect.succeed({
                  result: "success",
                  message: "installed skill a",
                  artifact: {
                    path: ".agents/skills/a",
                    scope: "project",
                    change: "created",
                    agents: ["codex", "universal", "claude-code"],
                  },
                }),
              },
            },
            {
              coverage: "eligible",
              step: {
                readiness: "ready",
                label: "hook:b",
                run: Effect.succeed({
                  result: "success",
                  message: "installed hook b",
                  artifact: {
                    path: ".claude/settings.json",
                    scope: "project",
                    change: "updated",
                    agents: ["claude-code", "cursor"],
                  },
                }),
              },
            },
            {
              coverage: "ineligible",
              step: {
                readiness: "ready",
                label: "knowledge:c",
                run: Effect.succeed({
                  result: "success",
                  message: "installed knowledge c",
                  artifact: {
                    path: "agent_extensions/@test/knowledge/c",
                    scope: "project",
                    change: "created",
                    agents: ["ignored-agent"],
                  },
                }),
              },
            },
          ],
          validate: Effect.void,
        });
        if (graphStep.readiness === "error") {
          return yield* installRefused({ category: "internal", detail: graphStep.errorMessage });
        }

        const result = yield* graphStep.run;
        expect(result).toMatchObject({
          result: "success",
          artifact: {
            path: "pack graph",
            scope: "project",
            agents: ["codex", "claude-code", "cursor"],
            fileCount: 1,
            targets: [{ path: "agent_extensions/@test/packs/covered", change: "created" }],
          },
        });
      }),
    ),
  );

  it.effect("publishes applicable empty coverage only for eligible applicable leaves", () =>
    provide(
      Effect.gen(function* () {
        const graphStep = yield* buildReconciliationClosure({
          toStepFailure: lifecycleStepFailure,
          label: "@test/packs/empty",
          message: "installed empty pack",
          artifact: { path: "pack graph", scope: "project", change: "updated" },
          children: [
            {
              coverage: "eligible",
              step: {
                readiness: "ready",
                label: "skill:empty",
                run: Effect.succeed({
                  result: "success",
                  message: "installed skill",
                  artifact: {
                    path: "agent_extensions/@test/skills/empty",
                    scope: "project",
                    change: "created",
                    agents: [],
                  },
                }),
              },
            },
          ],
          validate: Effect.void,
        });
        if (graphStep.readiness === "error") {
          return yield* installRefused({ category: "internal", detail: graphStep.errorMessage });
        }

        expect(yield* graphStep.run).toMatchObject({
          result: "success",
          artifact: { agents: [] },
        });
      }),
    ),
  );

  it.effect("rolls back when an eligible leaf reports coverage from another scope", () =>
    provide(
      Effect.gen(function* () {
        const target = path.join(workspace.root, "coverage-scope.txt");
        fs.writeFileSync(target, "before\n");
        const graphStep = yield* buildReconciliationClosure({
          toStepFailure: lifecycleStepFailure,
          label: "@test/packs/mixed-scope",
          message: "installed mixed-scope pack",
          artifact: { path: "pack graph", scope: "project", change: "updated" },
          children: [
            {
              coverage: "eligible",
              step: {
                readiness: "ready",
                label: "skill:user",
                run: protectedWrite(target, "after\n").pipe(
                  Effect.map(
                    () =>
                      ({
                        result: "success",
                        message: "installed user skill",
                        artifact: {
                          path: ".agents/skills/user-skill",
                          scope: "user",
                          change: "created",
                          agents: ["codex"],
                        },
                      }) satisfies JobStepResult,
                  ),
                ),
              },
            },
          ],
          validate: Effect.void,
        });
        if (graphStep.readiness === "error") {
          return yield* installRefused({ category: "internal", detail: graphStep.errorMessage });
        }

        const error = yield* Effect.flip(graphStep.run);
        expect(error.detail).toBe("Closure coverage spans project and user scopes");
        expect(fs.readFileSync(target, "utf8")).toBe("before\n");
      }),
    ),
  );
});
