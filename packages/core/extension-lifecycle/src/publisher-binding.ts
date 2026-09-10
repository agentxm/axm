/**
 * Publisher binding trust classification.
 *
 * A Registry resolution binds a publisher identity. When an operation
 * proposes to replace an already accepted binding for the same configured
 * extension with a different one, that transition is a trust decision a
 * person makes at a prompt: no flag and no unattended mode can approve it.
 * Every route that can replace an accepted binding — root and type update
 * forms, reinstall and re-resolution, and pack closures — classifies the
 * transition from the structured accepted and proposed identities here, so
 * the same rule holds everywhere the transition can occur.
 *
 * A first acceptance is not a change, and an integrity mismatch while
 * reacquiring the same accepted identity remains a hard failure elsewhere.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import type {
  Plan,
  PlanRiskCondition,
  PlannedJobStep,
  RegistryBindingProposal,
} from "@agentxm/workspace-operations";
import { acceptedResolutionRef, WorkspaceMutations } from "@agentxm/workspace-state";
import { targetFromRef } from "@agentxm/extension-workspace";

export interface PublisherBindingTransition {
  readonly extensionType: ExtensionType;
  /** The configured (local) name whose accepted resolution changes publisher. */
  readonly target: string;
  readonly owner: string;
  readonly packageName: string;
  /** The accepted publisher binding being replaced. */
  readonly accepted: string;
  /** The publisher binding the operation proposes to accept. */
  readonly proposed: string;
}

export const PUBLISHER_CHANGE_CONDITION_ID = "publisher-ownership-change";

const ACCEPTED_RESOLUTION_UNREADABLE_ID = "accepted-resolution-unreadable";

/** The structured proposal an extension ref makes, when it is a Registry ref. */
export const registryBindingProposal = (ref: ExtensionRef): RegistryBindingProposal | undefined =>
  ref.refType === "registry"
    ? {
        extensionType: ref.type,
        target: targetFromRef(ref).name,
        owner: ref.owner,
        packageName: ref.name,
        version: ref.version,
        publisherBindingId: ref.publisherBindingId,
      }
    : undefined;

/**
 * Classify one proposed acceptance against the accepted resolution for the
 * same configured target. Only a Registry binding replacing a different
 * Registry binding is a publisher change.
 */
export const classifyPublisherBindingTransition = (args: {
  readonly accepted: Option.Option<ExtensionRef>;
  readonly proposed: RegistryBindingProposal;
}): Option.Option<PublisherBindingTransition> =>
  Option.flatMap(args.accepted, (accepted) =>
    accepted.refType === "registry" &&
    accepted.type === args.proposed.extensionType &&
    accepted.publisherBindingId !== args.proposed.publisherBindingId
      ? Option.some({
          extensionType: args.proposed.extensionType,
          target: args.proposed.target,
          owner: args.proposed.owner,
          packageName: args.proposed.packageName,
          accepted: accepted.publisherBindingId,
          proposed: args.proposed.publisherBindingId,
        })
      : Option.none(),
  );

const describeTransition = (transition: PublisherBindingTransition): string =>
  `${transition.owner}/${toExtensionTypePlural(transition.extensionType)}/${transition.packageName}`;

/** The warning a step carries when its acceptance changes publisher. */
export const publisherTransitionWarning = (transition: PublisherBindingTransition): string =>
  `Publisher identity changed (${transition.accepted} → ${transition.proposed}); confirm only if you trust the current publisher`;

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
          .map(describeTransition)
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
