/**
 * Registration of the extension-type managers as projection participants.
 *
 * `workspace-projection` evaluates the invariant facts without knowing which
 * capability materializes a unit; the owners register here instead. Each
 * manager's failure family is restated in projection's participant vocabulary:
 * projection's own failures pass through typed, and anything else becomes
 * `ProjectionParticipantFailed` naming the unit and the failure the manager
 * decided.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HookManager, KnowledgeManager, RuleManager, SubagentManager } from "./managers.js";
import type { ExtensionManagerFailure } from "./errors.js";
import type { ManagerRequirements } from "./manager-contract.js";
import {
  isProjectionError,
  mapProjectionPlanFailure,
  ProjectionParticipantFailed,
  ProjectionParticipants,
  type AggregateOwnershipUnitId,
  type OwnershipUnitId,
  type ParticipantProjectionPlans,
  type ProjectionParticipant,
  type ProjectionParticipantFailure,
  type ProjectionPlan,
} from "@agentxm/workspace-projection";

/**
 * A manager failure stated in projection's vocabulary. Projection's own
 * family keeps its exact identity; every other failure is named by the unit it
 * blocked and the failure the manager decided, without an application error
 * envelope and without rendering.
 */
const toParticipantFailure =
  (unitId: OwnershipUnitId) =>
  (failure: ExtensionManagerFailure): ProjectionParticipantFailure =>
    isProjectionError(failure)
      ? failure
      : new ProjectionParticipantFailed({
          unitId,
          detail: `The owner of ${unitId} could not project it (${failure._tag}).`,
        });

interface ProjectionPlanningManager {
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

const participant = (args: {
  readonly units: ReadonlyArray<AggregateOwnershipUnitId>;
  readonly failureUnitId: AggregateOwnershipUnitId;
  readonly manager: ProjectionPlanningManager;
}): ProjectionParticipant => {
  const onFailure = toParticipantFailure(args.failureUnitId);
  return {
    units: args.units,
    projectionPlans: (): ParticipantProjectionPlans =>
      args.manager.projectionPlans().pipe(
        Effect.map((plans) => plans.map((plan) => mapProjectionPlanFailure(plan, onFailure))),
        Effect.mapError(onFailure),
      ),
  };
};

export const ProjectionParticipantsLive = Layer.effect(
  ProjectionParticipants,
  Effect.gen(function* () {
    const rules = yield* RuleManager;
    const hooks = yield* HookManager;
    const knowledge = yield* KnowledgeManager;
    const subagents = yield* SubagentManager;
    const onSubagentFailure = toParticipantFailure("subagent:native-profile");
    return {
      aggregates: [
        participant({
          units: ["rule:instructions-region"],
          failureUnitId: "rule:instructions-region",
          manager: rules,
        }),
        participant({
          units: ["hook:agent-hook-entries", "hook:fallback-region"],
          failureUnitId: "hook:agent-hook-entries",
          manager: hooks,
        }),
        participant({
          units: ["knowledge:discovery-region"],
          failureUnitId: "knowledge:discovery-region",
          manager: knowledge,
        }),
      ],
      subagents: Option.some({
        projectionObservation: (ref) =>
          subagents.projectionObservation(ref).pipe(Effect.mapError(onSubagentFailure)),
      }),
    };
  }),
);
