/** Public projection-adapter boundary; implementation modules remain sealed. */

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
