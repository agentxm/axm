import * as Effect from "effect/Effect";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  operationPresentation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";

import { buildAtomicPackGraphStep, type AtomicPackGraphChild } from "../packs/graph-transition.js";
import {
  resolveTargetedUpdateContext,
  type TargetedUpdateContext,
} from "./targeted-update-context.js";

export const TARGETED_UPDATE_STALE_DETAIL =
  "The targeted update ownership context became stale before apply.";

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const validatePostcondition = (args: {
  readonly expected: TargetedUpdateContext;
  readonly actual: TargetedUpdateContext;
  readonly explicitRange?: string;
}): Effect.Effect<void, AppError> => {
  if (args.explicitRange === undefined) {
    return args.actual.fingerprint === args.expected.fingerprint
      ? Effect.void
      : Effect.fail(
          makeAppError({
            code: "internal",
            detail: "Targeted update changed desired ownership or owning pack evidence",
          }),
        );
  }

  const expectedPublic = args.expected.public;
  const actualPublic = args.actual.public;
  const preserved =
    actualPublic.blocker === undefined &&
    actualPublic.ownership === expectedPublic.ownership &&
    actualPublic.activation === expectedPublic.activation &&
    actualPublic.authority === expectedPublic.authority &&
    actualPublic.direct?.source === expectedPublic.direct?.source &&
    actualPublic.direct?.enabled === expectedPublic.direct?.enabled &&
    actualPublic.direct?.constraint === args.explicitRange &&
    actualPublic.effectiveConstraint === expectedPublic.effectiveConstraint &&
    same(actualPublic.packs, expectedPublic.packs) &&
    same(actualPublic.memberClosure, expectedPublic.memberClosure) &&
    args.actual.packEvidenceFingerprint === args.expected.packEvidenceFingerprint;
  return preserved
    ? Effect.void
    : Effect.fail(
        makeAppError({
          code: "internal",
          detail: "Targeted update did not preserve its desired ownership postcondition",
        }),
      );
};

export const wrapTargetedUpdatePlan = (args: {
  readonly plan: Plan;
  readonly context: TargetedUpdateContext;
  readonly explicitRange?: string;
}): Effect.Effect<Plan, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const children: ReadonlyArray<AtomicPackGraphChild> = args.plan.jobs.flatMap((job) =>
      job.steps.map((step) => ({
        step,
        coverage: args.context.public.target.type === "knowledge" ? "ineligible" : "eligible",
      })),
    );
    const firstArtifact = children.find((child) => child.step.artifact !== undefined)?.step
      .artifact;
    const artifact = firstArtifact ?? {
      path: args.context.public.target.fqn,
      scope: workspace.scope,
      change: "updated" as const,
    };
    const builtStep = yield* buildAtomicPackGraphStep({
      label: args.context.public.target.fqn,
      message: `Updated ${args.context.public.target.fqn}`,
      artifact,
      children,
      reportUnchangedWhenChildrenUnchanged: true,
      preTransition: resolveTargetedUpdateContext({
        target: args.context.public.target,
        ...(args.explicitRange === undefined ? {} : { explicitRange: args.explicitRange }),
      }).pipe(
        Effect.flatMap((fresh) =>
          fresh.fingerprint === args.context.fingerprint
            ? Effect.void
            : Effect.fail(makeAppError({ code: "conflict", detail: TARGETED_UPDATE_STALE_DETAIL })),
        ),
      ),
      validate: resolveTargetedUpdateContext({
        target: args.context.public.target,
        ...(args.explicitRange === undefined ? {} : { explicitRange: args.explicitRange }),
      }).pipe(
        Effect.flatMap((actual) =>
          validatePostcondition({
            expected: args.context,
            actual,
            ...(args.explicitRange === undefined ? {} : { explicitRange: args.explicitRange }),
          }),
        ),
      ),
    });

    // Ownership-context staleness resolves as typed blocking rather than as a
    // step failure, so the operation terminates blocked/stale-candidate.
    const graphStep: PlannedJobStep =
      builtStep.readiness === "error"
        ? builtStep
        : {
            ...builtStep,
            run: builtStep.run.pipe(
              Effect.catch((error) =>
                error.category === "conflict" && error.detail === TARGETED_UPDATE_STALE_DETAIL
                  ? Effect.succeed({
                      result: "error",
                      message: TARGETED_UPDATE_STALE_DETAIL,
                      error,
                      blocking: { class: "stale-candidate" },
                    } satisfies JobStepResult)
                  : Effect.fail(error),
              ),
            ),
          };

    return {
      ...args.plan,
      name: `Update ${args.context.public.target.fqn}`,
      description: args.plan.description,
      presentation: operationPresentation(
        { imperative: "update", past: "Updated", gerund: "Updating" },
        args.context.public.target.type,
      ),
      jobs: [{ concurrency: 1, steps: [graphStep] }],
    } satisfies Plan;
  });
