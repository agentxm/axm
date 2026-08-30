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
  makeProspectiveExtensionConstraintFacts,
  planExtensionConstraintFact,
  type ExtensionConstraintFactContributor,
  type ExtensionConstraintInvariantFact,
  type ExtensionConstraintPlanningDecision,
  type ProspectiveExtensionConstraintCandidate,
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
export { reconcilePatternList, type PatternListReconciliation } from "./pattern-list-adapter.js";
export {
  managedKeyedBlockNames,
  reconcileKeyedBlock,
  type KeyedBlockReconciliation,
} from "./keyed-block-adapter.js";
export {
  MARKER_KIND_END,
  MARKER_KIND_FILE,
  MARKER_KIND_POINT,
  MARKER_KIND_START,
  MARKER_VERSION,
  commentStyleForTarget,
  markerForFile,
  parseMarker,
  serializeMarker,
  type FileCommentStyle,
  type ManagedMarker,
  type MarkerParseResult,
  type RegionMarker,
  type RegionName,
} from "./marker-grammar.js";
