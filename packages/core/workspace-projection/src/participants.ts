/**
 * The registry of capabilities that own projection units.
 *
 * Projection decides what an owned unit must contain and what its observation
 * means. It does not know which capability materializes a unit, and it must
 * not: the extension-type managers plan projections through this package, so
 * importing them back would close a cycle. Instead each owner registers here,
 * and the invariant-fact evaluator reads the registry plus workspace state.
 *
 * A participant states its failures in its own vocabulary. Projection's own
 * family arrives typed; anything else arrives as `ProjectionParticipantFailed`
 * carrying the producing capability's sentence. Projection never receives an
 * application error envelope and never renders one.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as ServiceMap from "effect/Context";
import type { NativeWriteAuthority } from "@agentxm/agent-integration";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ProjectionParticipantFailure } from "./errors.js";
import type { ProjectionPlan } from "./planning.js";
import {
  HOOK_FALLBACKS_REGION_OWNER,
  KNOWLEDGE_REGION_OWNER,
  RULES_REGION_OWNER,
  type AggregateOwnershipUnitId,
} from "./units.js";

/**
 * What a participant needs to plan and observe its units. Owners keep these
 * explicit rather than capturing the platform into their plans; the layer that
 * evaluates the facts composes them once.
 */
export type ProjectionParticipantRequirements =
  FileSystem.FileSystem | Path.Path | HttpClient.HttpClient | NativeWriteAuthority;

/** Plans an owner exposes for the aggregate units it materializes. */
export type ParticipantProjectionPlans = Effect.Effect<
  ReadonlyArray<
    ProjectionPlan<void, ProjectionParticipantFailure, ProjectionParticipantRequirements>
  >,
  ProjectionParticipantFailure,
  ProjectionParticipantRequirements
>;

/**
 * One capability that owns aggregate projection units.
 *
 * `units` is the complete set this participant answers for. When planning
 * fails, every listed unit becomes one unavailable fact, so a participant that
 * owns two units (the native hook entries and the fallback region) reports two.
 */
export interface ProjectionParticipant {
  readonly units: ReadonlyArray<AggregateOwnershipUnitId>;
  readonly projectionPlans: () => ParticipantProjectionPlans;
}

/** What a subagent's owner reports about one rendered native profile. */
export interface SubagentProjectionObservation {
  readonly present: boolean;
  readonly current: boolean;
}

/**
 * Subagent profiles are singleton units resolved per desired node, so their
 * owner is asked for one observation at a time rather than for plans.
 */
export interface SubagentProjectionObserver<E = ProjectionParticipantFailure> {
  readonly projectionObservation: (
    ref: SubagentExtensionRef,
  ) => Effect.Effect<SubagentProjectionObservation, E, ProjectionParticipantRequirements>;
}

export interface ProjectionParticipantsService {
  /** Aggregate-unit owners, in the order their facts are reported. */
  readonly aggregates: ReadonlyArray<ProjectionParticipant>;
  /** Absent when nothing in the composition materializes subagent profiles. */
  readonly subagents: Option.Option<SubagentProjectionObserver>;
}

export class ProjectionParticipants extends ServiceMap.Service<
  ProjectionParticipants,
  ProjectionParticipantsService
>()("@agentxm/workspace-projection/participants/ProjectionParticipants") {}

/**
 * How an aggregate unit is named and owned when its participant could not
 * plan it. The subject exists whether or not the owner can be reached, so
 * projection states it rather than asking the participant for it.
 */
export interface AggregateUnitSubject {
  /** Operator-facing name of the unit, used when no target file is known. */
  readonly path: string;
  /** Marker provenance owner, for units that carry one. */
  readonly owner?: string;
  /** Extension type whose enabled desired nodes are the unit's contributors. */
  readonly contributorType: ExtensionType;
}

const aggregateUnitSubjects: Readonly<Record<AggregateOwnershipUnitId, AggregateUnitSubject>> = {
  "rule:instructions-region": {
    path: "managed Rules region",
    owner: RULES_REGION_OWNER,
    contributorType: "rule",
  },
  "hook:agent-hook-entries": {
    path: "managed hook projections",
    contributorType: "hook",
  },
  "hook:fallback-region": {
    path: "managed Hook fallback region",
    owner: HOOK_FALLBACKS_REGION_OWNER,
    contributorType: "hook",
  },
  "knowledge:discovery-region": {
    path: "managed Knowledge discovery region",
    owner: KNOWLEDGE_REGION_OWNER,
    contributorType: "knowledge",
  },
};

export const aggregateUnitSubject = (unitId: AggregateOwnershipUnitId): AggregateUnitSubject =>
  aggregateUnitSubjects[unitId];

/** A registry with no owners: every fact comes from workspace state alone. */
export const emptyProjectionParticipants: ProjectionParticipantsService = {
  aggregates: [],
  subagents: Option.none(),
};
