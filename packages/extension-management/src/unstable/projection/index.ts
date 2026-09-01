/**
 * Residue of the projection subsystem: the workspace invariant-facts service,
 * which stays beside the knowledge manager until the feature-slice
 * extractions. The projection kernel lives in `@agentxm/extension-workspace`.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  PROJECTION_INVARIANT_PREDICATE,
  WorkspaceInvariantFacts,
  WorkspaceInvariantFactsLive,
  makeProjectionInvariantFact,
  projectionFactIsViolation,
  projectionFactRequiresReconciliation,
  type ProjectionInvariantFact,
  type ProjectionObservationStatus,
  type WorkspaceInvariantFactsService,
} from "./invariant-facts.js";
