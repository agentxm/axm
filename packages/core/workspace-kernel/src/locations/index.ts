/** Physical native addresses. Identity is an observation, never ownership authority. */
export { observationViewLayer, type NativeObservationView } from "./observation-view.js";
export { nativeInode } from "./native-inode.js";
export { captureNativeLocationSet, type NativeLocationSet } from "./native-location-set.js";
export {
  OwnershipUnitAddressSchema,
  NativeLocationOutcomeSchema,
  combineNativeLocationOutcomes,
  nativeUnitKey,
  type OwnershipUnitAddress,
  type NativeLocationOutcome,
} from "./native-outcomes.js";
export {
  NativeLocationError,
  NativeResolutionRoot,
  CanonicalNativePath,
  assertNativeMutationWithin,
  assertNoPhysicalOverlap,
  pathsOverlap,
  resolveNativeEntry,
  resolveNativeReferent,
  type NativeEntryAddress,
} from "./native-address.js";
export {
  StructuralInverseSchema,
  applyStructuralInverse,
  captureContainerIdentity,
  deriveStructuralInverse,
  forgetContainerReceipt,
  readContainerReceipts,
  recordContainerReceipt,
  updateContainerReceipts,
  verifyContainerIdentity,
  type ContainerIdentity,
  type ContainerIdentityContext,
  type ContainerReceipt,
  type ContainerReceiptMutation,
  type ContainerReceipts,
  type StructuralInverse,
} from "./container-receipts.js";
export {
  copiedDirectoryReceiptPath,
  captureCopiedDirectory,
  copiedDirectoryIsCurrent,
  copiedDirectoryCanReplace,
  readCopiedDirectory,
  retireCopiedDirectory,
  unchangedCopiedFiles,
  type CopiedDirectoryReceipt,
} from "./copied-directory.js";

export {
  resolveNativeReadLocation,
  resolveDeclaredNativeLocations,
  type NativeDirectoryInputs,
  type ResolvedNativeReadLocation,
} from "./declared-native-locations.js";
export {
  nativeAuthorityRoots,
  captureNativeAuthorityRoots,
  assertNativeMutationWithinRoots,
  type NativeAuthorityRootWitness,
} from "./native-authority-roots.js";
export { validateContainedLink } from "./contained-link.js";
