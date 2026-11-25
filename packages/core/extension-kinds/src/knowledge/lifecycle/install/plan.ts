/**
 * Installing Open Knowledge Format bundles.
 *
 * A bundle becomes discoverable through the shared discovery region, so
 * several bundles in one operation defer that render until every contributor
 * has landed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { DesiredStateGraph } from "@agentxm/workspace-kernel/workspace-state";

import { KnowledgeManager, type RuleManager } from "@agentxm/workspace-kernel/materialization";
import {
  planInstructionContributorInstall,
  type InstallStepRequirements,
  type ResolvedInstallRef,
} from "@agentxm/workspace-kernel/reconciliation";
import type { Plan, OperationRefused } from "@agentxm/workspace-kernel/operations";

import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";

/** Knowledge bundles the request selected. */
export interface KnowledgeInstallIntent {
  /** All Knowledge sources selected by the enclosing configured install for native preflight. */
  readonly projectionRefs?: ReadonlyArray<KnowledgeExtensionRef>;
  /** The enclosing install has resolved this complete proposed contributor graph. */
  readonly desiredGraph?: DesiredStateGraph;
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<ResolvedInstallRef<KnowledgeExtensionRef>>;
}

/** The closures a settled knowledge intent becomes. */
export const planKnowledgeInstall: (
  intent: KnowledgeInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  OperationRefused,
  InstallStepRequirements | KnowledgeManager | RuleManager
> = Effect.fnUntraced(function* (intent: KnowledgeInstallIntent) {
  const manager = yield* KnowledgeManager;
  return yield* planInstructionContributorInstall({
    intent,
    type: "knowledge",
    manager,
    nameOf: (ref) => ref.knowledge.name,
    wording: {
      priorDesiredState: "Cannot establish prior knowledge desired state",
      prepareConflict: "Native locations cannot realize the proposed knowledge content",
      exposureConflict: "Cannot establish every source exposed by the Knowledge projection",
      configuredAgents: "Cannot establish configured agents for Knowledge install planning",
      memberPlanningFailed: (name) => `Knowledge install planning failed for ${name}`,
    },
    memberMessage: (name) => `Installed ${name}`,
    buildArtifact: ({ ref, change, observation, scope }) => ({
      path: observation.targets[0]?.path ?? ref.knowledge.name,
      scope,
      agents: observation.agents,
      ...(observation.nativeLocations === undefined
        ? {}
        : { nativeLocations: observation.nativeLocations }),
      targets: observation.targets.map((target) => ({ ...target, change })),
    }),
    projectionStep: {
      key: "projection:knowledge:discovery-region",
      label: "knowledge projection",
      message: "Rendered installed Knowledge bundles from the complete contributor set",
    },
    plan: { name: "Install knowledge", description: "Install Open Knowledge Format bundle" },
  });
});
