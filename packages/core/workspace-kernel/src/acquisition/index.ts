/**
 * @agentxm/workspace-kernel/acquisition public API.
 *
 * Acquisition of extension content into the workspace: the verified source
 * trees a transition retains, the bounded acquisition queue and tree
 * measurement, canonical package staging, copy, reuse, and swap, on-disk
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
  acquiredRegistryPackageFiles,
  sourceRefContentKey,
  recordMaterializedPackage,
} from "./acquired-content.js";
export { selectAcquisitionQueue } from "./acquisition-queue.js";
export {
  AcquiredTreeLimitExceeded,
  MAX_ACQUIRED_TREE_ENTRIES,
  measureAcquiredTree,
} from "./measure-acquired-tree.js";

// Canonical package staging, copy, reuse, and on-disk materializability
export { prepareCanonicalParents, retireCanonicalDirectory } from "./canonical-parent-receipts.js";
export {
  canonicalMaterializationPaths,
  createCanonicalDirectory,
  materializeExternalPackageWithTreeIntegrity,
  recoverCanonicalDirectory,
  replaceCanonicalDirectory,
  replaceCanonicalDirectoryWithInspection,
  reusableCanonicalTree,
  type CanonicalDirectoryReplacementError,
  type MaterializedPackage,
} from "./canonical-directory.js";
export { copyExtensionDirectory, DirectoryCopyLimitExceeded } from "./copy-directory.js";
export {
  configuredMcpServersToDiskRefs,
  configuredPacksToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
} from "./materializable-from-disk.js";

// Which archive paths a package includes
export { isArchivePathIncluded } from "./archive-paths.js";

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
