/**
 * Capability-derived lifecycle contract shared by conformance tiers.
 *
 * The contract is derived from `EXTENSION_TYPE_TABLE` axes. Consumers must not
 * branch on extension type names when deciding lifecycle obligations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as EffectRecord from "effect/Record";

import {
  EXTENSION_TYPE_TABLE,
  type ExtensionPlacement,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";

/** Mutation verbs every registry-distributed extension exposes. */
export const LIFECYCLE_MUTATION_VERBS = [
  "install",
  "update",
  "enable",
  "disable",
  "uninstall",
] as const;

/** @experimental This API is unstable and may change without notice. */
export type LifecycleMutationVerb = (typeof LIFECYCLE_MUTATION_VERBS)[number];

/** How user-scope materialization is decided for a type. */
export type LifecycleScopeSupport = "native" | "agent-capability-dependent";

/** How a type selects a single configured target for update conformance. */
export type LifecycleUpdateSelection = "all" | "name-filter";

/** @experimental This API is unstable and may change without notice. */
export interface ExtensionLifecycleContract {
  readonly placement: ExtensionPlacement;
  readonly mutations: ReadonlyArray<LifecycleMutationVerb>;
  readonly scopeSupport: LifecycleScopeSupport;
  readonly updateSelection: LifecycleUpdateSelection;
  readonly activationConfirmation: boolean;
  readonly preview: true;
  readonly transactionalPostcondition: true;
}

/**
 * Lifecycle expectations for every extension type, including packs.
 * Per-agent placement delegates user-scope availability to the selected
 * agent's capability model; workspace and container placement are native.
 */
export const EXTENSION_LIFECYCLE_CONTRACT: Record<ExtensionType, ExtensionLifecycleContract> =
  EffectRecord.map(EXTENSION_TYPE_TABLE, (row) => ({
    placement: row.placement,
    mutations: LIFECYCLE_MUTATION_VERBS,
    scopeSupport: row.placement === "per-agent" ? "agent-capability-dependent" : "native",
    updateSelection: row.placement === "container" ? "all" : "name-filter",
    activationConfirmation: !(row.placement === "workspace" && row.governs === "package-body"),
    preview: true,
    transactionalPostcondition: true,
  }));
