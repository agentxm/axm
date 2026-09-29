import {
  StepFailureConversion,
  buildReconciliationClosure,
  type ReconciliationChild,
  type InstallStepRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
/**
 * Wrapping a targeted update in one atomic ownership transition.
 *
 * A targeted update moves a declaration whose ownership the workspace already
 * settled. Between settling that ownership and applying the advance, the
 * workspace could change underneath: a Pack could be installed, removed, or
 * re-accepted, or the direct declaration could gain or lose a constraint. So
 * the step rechecks the ownership fingerprint under the transition before it
 * writes anything, and validates the ownership it must leave behind before it
 * commits. A context that moved resolves as a stale candidate — a blocked
 * outcome a person reruns — rather than as an error, because nothing is wrong
 * except that the answer is out of date.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Path from "effect/Path";
import type * as FileSystem from "effect/FileSystem";

import {
  operationPresentation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
  ExtensionLifecycleFailed,
} from "@agentxm/workspace-kernel/operations";
import { WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceTransactionScope } from "@agentxm/workspace-kernel/settlement";
import {
  resolveTargetedUpdateContext,
  type TargetedUpdateContext,
  type TargetedUpdateContextFailure,
} from "@agentxm/workspace-kernel/resolution";

export const TARGETED_UPDATE_STALE_DETAIL =
  "The targeted update ownership context became stale before apply.";

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * Whether the transition left ownership as the context settled it: the same
 * owners, activation, authority, canonical bindings, Pack evidence, and
 * effective constraint, with the direct declaration's range equal to
 * `directConstraint`. Settings spelling is not ownership.
 */
const preservesOwnership = (
  expected: TargetedUpdateContext,
  actual: TargetedUpdateContext,
  directConstraint: string | undefined,
): boolean =>
  actual.public.blocker === undefined &&
  actual.public.ownership === expected.public.ownership &&
  actual.public.activation === expected.public.activation &&
  actual.public.authority === expected.public.authority &&
  actual.public.direct?.source === expected.public.direct?.source &&
  actual.public.direct?.enabled === expected.public.direct?.enabled &&
  actual.public.direct?.constraint === directConstraint &&
  actual.public.effectiveConstraint === expected.public.effectiveConstraint &&
  same(actual.public.packs, expected.public.packs) &&
  same(actual.public.memberClosure, expected.public.memberClosure) &&
  actual.bindingFingerprint === expected.bindingFingerprint &&
  actual.packEvidenceFingerprint === expected.packEvidenceFingerprint;

const validatePostcondition = (args: {
  readonly expected: TargetedUpdateContext;
  readonly actual: TargetedUpdateContext;
  readonly explicitRange?: string;
}): Effect.Effect<void, ExtensionLifecycleFailed, never> =>
  // Without a requested range the direct declaration keeps its own; with
  // one, the declaration must now carry exactly that range.
  preservesOwnership(
    args.expected,
    args.actual,
    args.explicitRange ?? args.expected.public.direct?.constraint,
  )
    ? Effect.void
    : Effect.fail(
        new ExtensionLifecycleFailed({
          category: "internal",
          detail:
            args.explicitRange === undefined
              ? "Targeted update changed desired ownership or owning pack evidence"
              : "Targeted update did not preserve its desired ownership postcondition",
        }),
      );

export const wrapTargetedUpdatePlan = (args: {
  readonly plan: Plan<InstallStepRequirements>;
  readonly context: TargetedUpdateContext;
  readonly explicitRange?: string;
}): Effect.Effect<
  Plan<InstallStepRequirements>,
  TargetedUpdateContextFailure,
  | StepFailureConversion
  | WorkspaceLocation
  | WorkspaceTransactionScope
  | FileSystem.FileSystem
  | Path.Path
> =>
  Effect.gen(function* () {
    const conversion = yield* StepFailureConversion;
    const location = yield* WorkspaceLocation;
    const children: ReadonlyArray<ReconciliationChild<InstallStepRequirements>> =
      args.plan.jobs.flatMap((job) =>
        job.steps.map((step) => ({
          step,
          coverage: args.context.public.target.type === "knowledge" ? "ineligible" : "eligible",
        })),
      );
    const firstArtifact = children.find((child) => child.step.artifact !== undefined)?.step
      .artifact;
    const artifact = firstArtifact ?? {
      path: args.context.public.target.fqn,
      scope: location.scope,
      change: "updated" as const,
    };
    const builtStep = yield* buildReconciliationClosure({
      toStepFailure: conversion.toStepFailure,
      label: args.context.public.target.fqn,
      message: `Updated ${args.context.public.target.fqn}`,
      artifact,
      children,
      preTransition: resolveTargetedUpdateContext({
        target: args.context.public.target,
        ...(args.explicitRange === undefined ? {} : { explicitRange: args.explicitRange }),
      }).pipe(
        Effect.flatMap((fresh) =>
          fresh.fingerprint === args.context.fingerprint
            ? Effect.void
            : Effect.fail(
                new ExtensionLifecycleFailed({
                  category: "conflict",
                  detail: TARGETED_UPDATE_STALE_DETAIL,
                }),
              ),
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
    const graphStep: PlannedJobStep<InstallStepRequirements> =
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
    } satisfies Plan<InstallStepRequirements>;
  });
