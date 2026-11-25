/**
 * Installing rules.
 *
 * The source grammar a rule request accepts, the discovery that turns it into
 * refs, and the closure each ref becomes — including who renders the shared
 * instructions region when more than one rule lands in the same operation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { DesiredStateGraph } from "@agentxm/workspace-kernel/workspace-state";

import { RuleManager, type KnowledgeManager } from "@agentxm/workspace-kernel/materialization";
import {
  planInstructionContributorInstall,
  type InstallArtifactPresentation,
  type InstallStepRequirements,
  type ResolvedInstallRef,
} from "@agentxm/workspace-kernel/reconciliation";
import type { Plan, OperationRefused } from "@agentxm/workspace-kernel/operations";

import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";

/** Rules the request selected. */
export interface RuleInstallIntent {
  /** All Rule sources selected by the enclosing configured install for native preflight. */
  readonly projectionRefs?: ReadonlyArray<RuleExtensionRef>;
  /** The enclosing install has resolved this complete proposed contributor graph. */
  readonly desiredGraph?: DesiredStateGraph;
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<ResolvedInstallRef<RuleExtensionRef>>;
}

/** The closures a settled rule intent becomes. */
export const planRuleInstall: (
  intent: RuleInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  OperationRefused,
  InstallStepRequirements | RuleManager | KnowledgeManager
> = Effect.fnUntraced(function* (intent: RuleInstallIntent) {
  const manager = yield* RuleManager;
  return yield* planInstructionContributorInstall({
    intent,
    type: "rule",
    manager,
    nameOf: (ref) => ref.rule.name,
    wording: {
      priorDesiredState: "Cannot establish prior rule desired state",
      prepareConflict: "Native locations cannot realize the proposed rule content",
      exposureConflict: "Cannot establish every source exposed by the Rule projection",
      configuredAgents: "Cannot establish configured agents for Rule install planning",
      memberPlanningFailed: (name) => `Rule install planning failed for ${name}`,
    },
    buildArtifact: ({ ref, change, observation, scope }) => {
      const targets = observation.targets.map((target) => ({
        path: target.path,
        change,
        ...(target.agentIds === undefined ? {} : { agentIds: target.agentIds }),
      }));
      return {
        path: targets[0]?.path ?? ref.rule.name,
        scope,
        agents: observation.agents,
        ...(observation.nativeLocations === undefined
          ? {}
          : { nativeLocations: observation.nativeLocations }),
        ...(ref.refType === "registry" ? { version: ref.version } : {}),
        ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
      } satisfies InstallArtifactPresentation;
    },
    projectionStep: {
      key: "projection:rule:instructions-region",
      label: "rule projections",
      message: "Rendered installed Rules from the complete contributor set",
    },
    plan: { name: "Install rules", description: "Install rule" },
  });
});
