/**
 * Shared projection subsystem: ownership-unit registry and contributor-set
 * resolution for aggregate managed outputs.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  EXTENSION_CONSTRAINT_INVARIANT_PREDICATE,
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
  planExtensionConstraintFact,
  type ExtensionConstraintInvariantFact,
  type ExtensionConstraintPlanningDecision,
} from "./constraint-invariant-fact.js";
export {
  activeContributors,
  activeNodesOfType,
  contributorForNode,
  INCOMPLETE_DESIRED_STATE_BLOCKER_ID,
  requireCompleteGraph,
  type AggregateContributor,
  type SourceLockEntryLike,
} from "./contributors.js";
export {
  aggregateOwnershipUnits,
  ownershipUnits,
  type OwnershipUnitDeclaration,
  type OwnershipUnitId,
  type AggregateOwnershipUnitId,
  type SingletonOwnershipUnitId,
} from "./units.js";
export {
  PROJECTION_INVARIANT_PREDICATE,
  WorkspaceInvariantFacts,
  WorkspaceInvariantFactsLive,
  makeProjectionInvariantFact,
  projectionFactIsViolation,
  projectionFactRequiresReconciliation,
  type ProjectionInvariantFact,
  type ProjectionObservationStatus,
  type ProjectionUnitObservation,
  type WorkspaceInvariantFactsService,
} from "./invariant-facts.js";
export {
  applyProjectionPlans,
  applyProjectionPlansWithResults,
  applyPlannedProjections,
  observeProjectionPlans,
  planAggregateProjection,
  planDesiredStateGraph,
  planSingletonProjection,
  type DesiredStateGraphPlanningDecision,
  type ProjectionAdapter,
  type ProjectionPlan,
  type ProjectionRenderInput,
} from "./planning.js";
export {
  reconcileManagedRegionFile,
  type ManagedRegionReconciliation,
} from "./managed-region-adapter.js";
