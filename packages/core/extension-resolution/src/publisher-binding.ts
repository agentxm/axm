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
 * Classification is all this module does: shaping the resulting plan risk
 * condition belongs to the feature that owns the plan.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";

/** The configured (local) name a ref occupies in workspace settings. */
const configuredNameFromRef = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "pack":
      return ref.pack.name;
    case "mcp-server":
      return ref.server.name;
    case "subagent":
      return ref.subagent.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "knowledge":
      return ref.knowledge.name;
  }
};

/**
 * The Registry identity a step proposes to accept. Trust classification
 * compares it with the accepted resolution for the same configured target,
 * so a change of publisher is identified from structured data rather than
 * from warning text.
 */
export interface RegistryBindingProposal {
  readonly extensionType: ExtensionType;
  /** The configured (local) name whose accepted resolution the step replaces. */
  readonly target: string;
  readonly owner: string;
  readonly packageName: string;
  readonly version: string;
  readonly publisherBindingId: string;
}

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

/** The structured proposal an extension ref makes, when it is a Registry ref. */
export const registryBindingProposal = (ref: ExtensionRef): RegistryBindingProposal | undefined =>
  ref.refType === "registry"
    ? {
        extensionType: ref.type,
        target: configuredNameFromRef(ref),
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

/** The identity sentence a transition names in operator-facing wording. */
export const describePublisherBindingTransition = (
  transition: PublisherBindingTransition,
): string =>
  `${transition.owner}/${toExtensionTypePlural(transition.extensionType)}/${transition.packageName}`;

/** The warning a step carries when its acceptance changes publisher. */
export const publisherTransitionWarning = (transition: PublisherBindingTransition): string =>
  `Publisher identity changed (${transition.accepted} → ${transition.proposed}); confirm only if you trust the current publisher`;
