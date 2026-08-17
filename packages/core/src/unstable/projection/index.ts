/**
 * Shared projection subsystem: ownership-unit registry and contributor-set
 * resolution for aggregate managed outputs.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  activeContributors,
  activeNodesOfType,
  contributorForNode,
  requireCompleteGraph,
  type AggregateContributor,
  type SourceLockEntryLike,
} from "./contributors.js";
export {
  aggregateOwnershipUnits,
  ownershipUnits,
  type OwnershipUnitDeclaration,
  type OwnershipUnitId,
} from "./units.js";
