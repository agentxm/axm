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
  PackSpecSchema,
  parseExtensionSpecParts,
  decodeExtensionNameSync,
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
  type ExtensionName,
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
} from "./common.js";

export { parseLicenseExpression } from "./license.js";

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

// Constants
export { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "./constants.js";

export {
  UNIVERSAL_SKILLS_DIR,
  UNIVERSAL_SKILLS_DIR_SEGMENT,
  isUniversalSkillsDir,
  isUniversalSkillsRelativeDir,
  resolveUniversalDirPresence,
} from "./universal-skills-dir.js";

// Ref base types
export type {
  ExtensionRefBase,
  SkillExtensionRefBase,
  CommandExtensionRefBase,
  McpServerExtensionRefBase,
  PackRefBase,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
} from "./ref-base.js";

// Extension ref union type
export type { ExtensionRef } from "./refs.js";

// Shared utilities
export { sanitizeName, copyExtensionDirectory, validatePathSafety } from "./utils.js";

// Reconciliation utilities
export { readAndDecodeManifest } from "./reconciliation-utils.js";

// Extension operations
export {
  type InstallOperationArgs,
  type MaterializeOperationArgs,
  type UninstallOperationArgs,
  type UninstallRetentionPolicy,
  buildInstallOperation,
  buildMaterializeOperation,
  buildUninstallOperation,
  formatPackageUrlParts,
  targetFromRef,
  toLabel,
  toLabelWithCompanions,
} from "./operations.js";

export {
  configuredCommandsToDiskRefs,
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

// Frontmatter parsing
export {
  parseFrontmatterEffect,
  parseFrontmatterSync,
  type FrontmatterResult,
} from "./frontmatter.js";

export {
  insertManagedFileBanner,
  managedFileFormatForPath,
  type ManagedFileBannerOptions,
  type ManagedFileFormat,
} from "./managed-file-banner.js";

export {
  applyOverrides,
  warnOnOrphanOverrides,
  type AgentOverrides,
  type AllAgentOverrides,
} from "./agent-overrides.js";
