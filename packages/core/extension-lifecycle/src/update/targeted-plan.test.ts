import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { JobStepResult, Plan, StepFailure } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { resolveTargetedUpdateContext } from "@agentxm/extension-resolution";

import { ExtensionLifecycleFailed } from "../errors.js";
import { lifecycleStepFailure } from "../step-failure.js";
import type { InstallStepRequirements } from "../install/vocabulary.js";
import { makeLifecycleFixture, type LifecycleFixture } from "../testing.js";
import { TARGETED_UPDATE_STALE_DETAIL, wrapTargetedUpdatePlan } from "./targeted-plan.js";

const target = {
  type: "skill" as const,
  name: "reviewer",
  fqn: "@acme/skills/reviewer",
};

const settingsWith = (skills: Record<string, unknown>): string =>
  JSON.stringify({ owner: "@acme", agents: [], skills });

describe("targeted update transaction", () => {
  let workspace: LifecycleFixture;

  beforeEach(() => {
    workspace = makeLifecycleFixture({
      settings: { owner: "@acme", agents: [], skills: { reviewer: target.fqn } },
    });
  });

  afterEach(() => {
    workspace.cleanup();
  });

  /** The workspace, its transaction scope, and the platform, over the temp root. */
  const provide = <A, E>(
    effect: Effect.Effect<A, E, InstallStepRequirements | WorkspaceMutations>,
  ) => workspace.provide(effect).pipe(Effect.provide(NodeServices.layer));

  const planWithStep = (run: Effect.Effect<JobStepResult, StepFailure>) =>
    ({
      _tag: "Plan",
      name: "Update reviewer",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [{ readiness: "ready", label: "reviewer", run }],
        },
      ],
    }) satisfies Plan<InstallStepRequirements>;

  const runnableStep = (plan: Plan<InstallStepRequirements>) => {
    const step = plan.jobs[0]?.steps[0];
    return step === undefined || step.readiness === "error"
      ? Effect.fail(
          new ExtensionLifecycleFailed({
            category: "internal",
            detail: "Expected a runnable step",
          }),
        )
      : Effect.succeed(step);
  };

  it.effect(
    "a stale ownership context resolves as typed stale-candidate blocking before the member step runs",
    () =>
      provide(
        Effect.gen(function* () {
          let childRan = false;
          const context = yield* resolveTargetedUpdateContext({ target });
          const wrapped = yield* wrapTargetedUpdatePlan({
            plan: planWithStep(
              Effect.sync(() => {
                childRan = true;
                return { result: "success", message: "updated reviewer" };
              }),
            ),
            context,
          });
          // The workspace moves underneath the settled context.
          workspace.writeFile(
            "axm.json",
            settingsWith({ reviewer: { source: target.fqn, enabled: false } }),
          );

          const result = yield* (yield* runnableStep(wrapped)).run;
          expect(result.result).toBe("error");
          if (result.result === "error") {
            expect(result.blocking?.class).toBe("stale-candidate");
            expect(result.message).toBe(TARGETED_UPDATE_STALE_DETAIL);
            expect(result.error.category).toBe("conflict");
          }
          expect(childRan).toBe(false);
        }),
      ),
  );

  it.effect("rolls back a member step that violates the ownership postcondition", () =>
    provide(
      Effect.gen(function* () {
        const mutations = yield* WorkspaceMutations;
        const settingsBefore = workspace.readFile("axm.json");
        const context = yield* resolveTargetedUpdateContext({ target });
        const wrapped = yield* wrapTargetedUpdatePlan({
          plan: planWithStep(
            mutations.removeSkillFromSettings(target.name).pipe(
              Effect.mapError(lifecycleStepFailure),
              Effect.map(() => ({
                result: "success" as const,
                message: "removed direct intent",
              })),
            ),
          ),
          context,
        });

        const error = yield* (yield* runnableStep(wrapped)).run.pipe(Effect.flip);
        expect(error.category).toBe("internal");
        expect(error.detail).toContain("changed desired ownership");
        expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      }),
    ),
  );

  it.effect("preserves an unchanged child result through the atomic wrapper", () =>
    provide(
      Effect.gen(function* () {
        const context = yield* resolveTargetedUpdateContext({ target });
        const wrapped = yield* wrapTargetedUpdatePlan({
          plan: planWithStep(
            Effect.succeed({
              result: "success",
              message: "reviewer is already current",
              artifact: { path: target.fqn, scope: "project", change: "unchanged" },
            }),
          ),
          context,
        });

        const result = yield* (yield* runnableStep(wrapped)).run;
        if (result.result === "error") {
          return yield* result.error;
        }
        expect(result.artifact?.change).toBe("unchanged");
      }),
    ),
  );
});
