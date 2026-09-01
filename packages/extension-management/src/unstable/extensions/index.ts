export {
  decodeDesiredExtensionIdentity,
  type DecodedDesiredExtensionIdentity,
  type DesiredPackageAuthority,
} from "./desired-identity.js";

export { forkExtensionPackage, type ForkExtensionPackageArgs } from "./fork-package.js";
export {
  importNativeExtensionPackage,
  type ImportNativeExtensionPackageArgs,
} from "./import-native-package.js";

export {
  installableExtensionTypes,
  installableExtensionTypePluralSegments,
  InstallableExtensionTypeSchema,
  InstallableExtensionTypePluralSchema,
  isInstallableExtensionType,
  isInstallableExtensionTypePlural,
  toInstallableExtensionType,
  toInstallableExtensionTypePlural,
  type InstallableExtensionType,
  type InstallableExtensionTypePlural,
} from "./installable-types.js";

// FQN parsing
export { fqnInvalidErrorToAppError } from "../app-error/conversions.js";

// Constants
export { ACQUIRED_EXTENSIONS_DIR } from "./constants.js";
export {
  acquiredExtensionDisplayPath,
  acquiredExtensionDisplayPathFromLockEntry,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  type ExtensionPathLockEntry,
  type ExtensionPathSource,
} from "./extension-paths.js";

// Ref base types
export type {
  ExtensionRefBase,
  SkillExtensionRefBase,
  McpServerExtensionRefBase,
  PackRefBase,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
  WorkspaceRefDetails,
} from "./ref-base.js";

// Extension ref union type
export type { ExtensionRef } from "./refs.js";

// Shared utilities
export {
  sanitizeName,
  normalizeExtensionName,
  copyExtensionDirectory,
  validatePathSafety,
} from "./utils.js";

export {
  enabledConfiguredEntries,
  isConfiguredEntryEnabled,
  type ConfiguredEntryEnabledState,
} from "./configured-entry.js";

export { preflightCreateOnly, type CreateOnlyPreflightArgs } from "./create-preflight.js";

// Reconciliation utilities

// Extension operations
export {
  type InstallOperationArgs,
  type AuthoredExtensionOperationArgs,
  type MaterializeOperationArgs,
  type NewExtensionOperationArgs,
  type UninstallOperationArgs,
  type UninstallRetentionPolicy,
  buildInstallOperation,
  buildAuthoredExtensionStep,
  buildMaterializeOperation,
  buildNewExtensionStep,
  buildUninstallOperation,
  extensionRefLifecycleWarnings,
  extensionRefRegistryLifecycle,
  formatPackageUrlParts,
  targetFromRef,
  toLabel,
  toLabelWithCompanions,
  toStepKey,
} from "./operations.js";

export {
  configuredMcpServersToDiskRefs,
  configuredPacksToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
} from "./materializable-from-disk.js";

// Rendered files tracking
export {
  RenderedFilePathSchema,
  RenderedFilesMapSchema,
  SourceHashSchema,
  computeSourceHash,
  type RenderedFilePath,
  type RenderedFilesMap,
  type SourceHash,
} from "./rendered-files.js";

export { computePackageContentHash } from "./package-hash.js";
export {
  computeMaterializedTreeIntegrity,
  TreeIntegritySchema,
  type TreeIntegrity,
} from "./materialized-tree.js";

export {
  insertManagedFileBanner,
  hasManagedFileBanner,
  managedFileFormatForPath,
  managedFileMarker,
  stripManagedFileBanner,
  type ManagedFileBannerOptions,
  type ManagedFileFormat,
  type ManagedFileProvenance,
  type ManagedFileSource,
} from "./managed-file-banner.js";

export {
  createCanonicalDirectory,
  canReuseExternalPackage,
  canReuseInstalledPackage,
  canonicalMaterializationPaths,
  materializeExternalPackage,
  materializeExternalPackageWithTreeIntegrity,
  materializeRegistryPackage,
  materializeRegistryPackageWithTreeIntegrity,
  recoverCanonicalDirectory,
  replaceCanonicalDirectory,
  replaceCanonicalDirectoryWithInspection,
  type CreateCanonicalDirectoryArgs,
  type CanReuseExternalPackageArgs,
  type CanReuseInstalledPackageArgs,
  type MaterializeExternalPackageArgs,
  type MaterializeRegistryPackageArgs,
  type MaterializedPackage,
  type RegistryPackageMaterializationMessages,
  type RecoverCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryWithInspectionArgs,
  type CanonicalDirectoryInspection,
} from "./package-materialization.js";

export { shouldReuseCanonicalInstall } from "./canonical-reuse.js";

export { markerFqnForRef, type MarkerFqnRef } from "./marker-fqn.js";

export {
  applyOverrides,
  warnOnOrphanOverrides,
  type AgentOverrides,
  type AllAgentOverrides,
} from "./agent-overrides.js";

export {
  evaluateSourceAuthority,
  type SourceAuthorityBlockedCause,
  type SourceAuthorityBlockedFact,
  type SourceAuthorityDecision,
  type SourceAuthorityInput,
  type SourceAuthorityRelationship,
  type SourceAuthorityTarget,
  type WorkspaceAuthorityStatus,
} from "./source-authority.js";
