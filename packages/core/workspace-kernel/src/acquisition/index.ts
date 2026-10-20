/**
 * @agentxm/workspace-kernel/acquisition public API.
 *
 * Acquisition of extension content into the workspace: the verified source
 * trees a transition retains, the bounded acquisition queue, the operation
 * scratch budget and tree measurement, canonical package staging, copy,
 * reuse, and swap, registry package fetch, verify, and extract, on-disk
 * materializability, the archive include predicate, the inherited Git
 * transport context, and the package materialization failure family.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Verified source trees retained for one workspace transition
export {
  AcquiredContent,
  acquiredDirectoryForRef,
  acquiredFilesForRef,
  sourceRefContentKey,
  recordMaterializedPackage,
} from "./acquired-content.js";
export { selectAcquisitionQueue } from "./acquisition-queue.js";
export {
  AcquiredTreeLimitExceeded,
  MAX_ACQUIRED_TREE_ENTRIES,
  measureAcquiredTree,
} from "./measure-acquired-tree.js";
export {
  MAX_ACQUIRED_TREE_BYTES,
  MAX_OPERATION_SCRATCH_BYTES,
  OperationScratchBudget,
  OperationScratchLimitExceeded,
  makeOperationScratchBudget,
} from "./scratch-budget.js";

// Canonical package staging, copy, reuse, and on-disk materializability
export { prepareCanonicalParents, retireCanonicalDirectory } from "./canonical-parent-receipts.js";
export {
  canonicalMaterializationPaths,
  createCanonicalDirectory,
  materializeExternalPackageWithTreeIntegrity,
  recoverCanonicalDirectory,
  replaceCanonicalDirectory,
  reusableCanonicalTree,
  type CanonicalDirectoryReplacementError,
} from "./canonical-directory.js";
export { copyExtensionDirectory, DirectoryCopyLimitExceeded } from "./copy-directory.js";
export {
  materializeRegistryPackage,
  materializeRegistryPackageWithTreeIntegrity,
} from "./registry-materialization.js";
export {
  configuredMcpServersToDiskRefs,
  configuredPacksToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
} from "./materializable-from-disk.js";

// Which archive paths a package includes
export { computeDistributionTreeIntegrity } from "./distribution-tree.js";
export { excludedDistributionLinkTarget } from "./distribution-links.js";
export {
  resolveFileSelection,
  type FileSelectionInput,
  type ResolvedFileSelection,
  type SelectionDecision,
  type SelectionRule,
  type SelectionRuleOrigin,
} from "./file-selection.js";

// The inherited Git transport context
export {
  gitTransportContextFingerprint,
  inheritedGitEnvironment,
} from "./git-transport-context.js";

// Failure vocabulary
export {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  PackageCopyFailed,
  PackageMaterializationFailed,
  StagedPackageInvalid,
  type MaterializationError,
} from "./errors.js";

export { ExternalArchiveInvalid, extractExternalArchive } from "./external-archive.js";
export { skillDirectoryNameForRef } from "./skill-identity.js";
