/**
 * Publisher-change plan shaping.
 *
 * `@agentxm/extension-resolution` classifies whether a proposed Registry
 * acceptance replaces an accepted publisher binding. This module turns that
 * classification into plan vocabulary: the per-step warning, the
 * interactive-only risk condition, and the blocking condition raised when an
 * accepted resolution cannot be read at all.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import {
  classifyPublisherBindingTransition,
  describePublisherBindingTransition,
  publisherTransitionWarning,
  type PublisherBindingTransition,
} from "@agentxm/extension-resolution";
import type { Plan, PlanRiskCondition, PlannedJobStep } from "@agentxm/workspace-operations";
import { acceptedResolutionRef, WorkspaceMutations } from "@agentxm/workspace-state";

export const PUBLISHER_CHANGE_CONDITION_ID = "publisher-ownership-change";

const ACCEPTED_RESOLUTION_UNREADABLE_ID = "accepted-resolution-unreadable";

/**
 * The interactive-only condition a plan carries when any of its steps
 * replaces an accepted publisher binding.
 */
export const publisherChangeRiskCondition = (
  transitions: ReadonlyArray<PublisherBindingTransition>,
): PlanRiskCondition | undefined =>
  transitions.length === 0
    ? undefined
    : {
        level: "confirmable",
        consent: "interactive-only",
        id: PUBLISHER_CHANGE_CONDITION_ID,
        detail: `Publisher identity changed for ${transitions
          .map(describePublisherBindingTransition)
          .join(", ")}; confirm only if you trust the current publisher.`,
      };

/** Append the publisher-change condition for the given transitions, if any. */
export const withPublisherTrustConditions = <R, O>(
  plan: Plan<R, O>,
  transitions: ReadonlyArray<PublisherBindingTransition>,
): Plan<R, O> => {
  const condition = publisherChangeRiskCondition(transitions);
  return condition === undefined
    ? plan
    : { ...plan, riskConditions: [...(plan.riskConditions ?? []), condition] };
};

const stepWithTransitionWarning = <R, O>(
  step: PlannedJobStep<R, O>,
  transition: PublisherBindingTransition,
): PlannedJobStep<R, O> => {
  const warning = publisherTransitionWarning(transition);
  switch (step.readiness) {
    case "ready": {
      const { message: _message, ...rest } = step;
      return { ...rest, readiness: "warn", warnMessage: warning };
    }
    case "warn":
      return { ...step, warnMessage: `${step.warnMessage}; ${warning}` };
    case "error":
      return step;
  }
};

/**
 * Classify every proposed Registry acceptance in a plan against the accepted
 * resolutions of the workspace, marking each changing step and attaching the
 * interactive-only condition. When an accepted resolution cannot be read the
 * plan blocks rather than proceeding without the comparison.
 */
export const withPublisherTrust = <R, O>(
  plan: Plan<R, O>,
): Effect.Effect<Plan<R, O>, never, WorkspaceMutations | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const proposals = plan.jobs.flatMap((job) =>
      job.steps.flatMap((step) => (step.registryBinding === undefined ? [] : [step])),
    );
    if (proposals.length === 0) return plan;

    const unreadable: Array<string> = [];
    const transitionsByKey = new Map<string, PublisherBindingTransition>();
    for (const step of proposals) {
      const proposed = step.registryBinding;
      if (proposed === undefined) continue;
      const accepted = yield* acceptedResolutionRef({
        workspace,
        type: proposed.extensionType,
        name: proposed.target,
      }).pipe(Effect.option);
      if (Option.isNone(accepted)) {
        unreadable.push(`${proposed.extensionType}:${proposed.target}`);
        continue;
      }
      const transition = classifyPublisherBindingTransition({
        accepted: accepted.value,
        proposed,
      });
      if (Option.isSome(transition)) {
        transitionsByKey.set(`${proposed.extensionType}:${proposed.target}`, transition.value);
      }
    }

    const transitions = [...transitionsByKey.values()];
    const marked: Plan<R, O> = {
      ...plan,
      jobs: plan.jobs.map((job) => ({
        ...job,
        steps: job.steps.map((step) => {
          const binding = step.registryBinding;
          const transition =
            binding === undefined
              ? undefined
              : transitionsByKey.get(`${binding.extensionType}:${binding.target}`);
          return transition === undefined ? step : stepWithTransitionWarning(step, transition);
        }),
      })),
    };
    const blocked: PlanRiskCondition | undefined =
      unreadable.length === 0
        ? undefined
        : {
            level: "blocked",
            id: ACCEPTED_RESOLUTION_UNREADABLE_ID,
            detail: `The accepted resolution for ${unreadable.join(", ")} could not be read, so the proposed publisher binding cannot be checked.`,
            errorCode: "conflict",
          };
    const withTrust = withPublisherTrustConditions(marked, transitions);
    return blocked === undefined
      ? withTrust
      : { ...withTrust, riskConditions: [...(withTrust.riskConditions ?? []), blocked] };
  });
