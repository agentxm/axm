/**
 * Extension schemas, types, and shared utilities for @agentxm/client-core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Common schemas and types
export {
  AgentIdSchema,
  AuthorSchema,
  CommonManifestBaseFields,
  ConfigurableAgentIdSchema,
  EXTENSION_NAME_PATTERN,
  ExtensionNameSchema,
  ExtensionVisibilitySchema,
  ExtensionTypePluralSchema,
  ExtensionDependencyConstraintMapSchema,
  ExtensionTypeSchema,
  FQN_PATTERN,
  ExtensionFqnPartsSchema,
  ExtensionFqnSchema,
  LicenseSchema,
  ExtensionSpecSchema,
  NON_PACK_FQN_PATTERN,
  NonPackExtensionDependencyConstraintMapSchema,
  NonPackExtensionFqnSchema,
  NonPackManifestFields,
  nonPackExtensionTypePluralSegments,
  PACK_FQN_PATTERN,
  PackFqnSchema,
  PublishOptionsSchema,
  PackSpecSchema,
  parseExtensionSpecParts,
  decodeExtensionNameSync,
  EXTENSION_ONLY_TYPES,
  WORKSPACE_CAPABILITY_EXTENSION_TYPES,
  CONTAINER_EXTENSION_TYPES,
  extensionTypeFromPlural,
  extensionTypeLabels,
  extensionTypePluralSegments,
  extensionTypePluralLabels,
  extensionTypePluralSentenceLabels,
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
  extensionTypes,
  isExtensionType,
  isExtensionTypePlural,
  parseExtensionFqnParts,
  toExtensionType,
  toExtensionTypePlural,
  toAuthor,
  type Author,
  type ConfigurableAgentId,
  type ContainerType,
  type ExtensionName,
  type ExtensionVisibility,
  type ExtensionDependencyConstraintMap,
  type ExtensionFqnParts,
  type ExtensionType,
  type ExtensionTypePlural,
  type ExtensionFqn,
  type ExtensionSpec,
  type NonPackExtensionDependencyConstraintMap,
  type NonPackExtensionFqn,
  type NonPackExtensionTypePlural,
  type PackFqn,
  type PackSpec,
  type PerAgentType,
  type PublishOptions,
  type WorkspaceCapabilityType,
} from "./common.js";

export { parseLicenseExpression } from "./license.js";

export {
  EXTENSION_METADATA_MAX_BYTES,
  EXTENSION_METADATA_MAX_DEPTH,
  ExtensionMetadataSchema,
  extensionMetadataCompactByteLength,
  extensionMetadataContainerDepth,
  type ExtensionMetadata,
} from "./manifest-metadata.js";

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
  RegistrySourcePatternPartsSchema,
  RegistrySourcePatternSchema,
  RegistrySourceRefPartsSchema,
  RegistrySourceRefSchema,
  formatRegistrySourcePatternParts,
  formatRegistrySourceRef,
  parseRegistrySourcePatternParts,
  parseRegistrySourceRef,
  type RegistrySourcePatternParts,
  type RegistrySourceRefParts,
} from "./registry-source.js";

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

export {
  HANDLE_PATTERN,
  HANDLE_PATTERN_SOURCE,
  HandleSchema,
  SLUG_PATTERN,
  SLUG_PATTERN_SOURCE,
  SlugSchema,
  decodeHandleSync,
  decodeSlugSync,
  handleFromSlug,
  normalizeHandle,
  normalizeSlug,
  slugFromHandle,
  type Handle,
  type Slug,
} from "./handle.js";

// FQN parsing
export {
  formatFqn,
  parseFqn,
  parseFqnOrThrow,
  FqnInvalidError,
  fqnInvalidErrorToAppError,
} from "./fqn.js";
export {
  matchesReleaseAgeExcludePattern,
  ReleaseAgeExcludePatternSchema,
  type ReleaseAgeExcludePattern,
} from "./fqn-pattern.js";

// Constants
export { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "./constants.js";
export {
  canonicalExtensionPathForLockEntry,
  externalExtensionPath,
  registryExtensionPath,
} from "./canonical-path.js";

export {
  UNIVERSAL_SKILLS_DIR,
  UNIVERSAL_SKILLS_DIR_SEGMENT,
  isUniversalSkillsDir,
  isUniversalSkillsRelativeDir,
  resolveUniversalDirPresence,
  stripTrailingSeparators,
} from "./universal-skills-dir.js";

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

// Frontmatter parsing
export {
  FrontmatterParseFailure,
  parseFrontmatterEffect,
  parseFrontmatterSync,
  type FrontmatterResult,
} from "./frontmatter.js";

export {
  insertManagedFileBanner,
  hasManagedFileBanner,
  managedFileFormatForPath,
  managedFileMarker,
  stripManagedFileBanner,
  type ManagedFileBannerOptions,
  type ManagedFileFormat,
} from "./managed-file-banner.js";

export {
  createCanonicalDirectory,
  canReuseExternalPackage,
  canReuseInstalledPackage,
  canonicalMaterializationPaths,
  materializeExternalPackage,
  materializeRegistryPackage,
  recoverCanonicalDirectory,
  replaceCanonicalDirectory,
  type CreateCanonicalDirectoryArgs,
  type CanReuseExternalPackageArgs,
  type CanReuseInstalledPackageArgs,
  type MaterializeExternalPackageArgs,
  type MaterializeRegistryPackageArgs,
  type RegistryPackageMaterializationMessages,
  type RecoverCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryArgs,
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
