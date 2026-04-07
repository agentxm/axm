/**
 * Extension schemas, types, and shared utilities for @axm.sh/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Common schemas and types
export {
  AgentIdSchema,
  AuthorSchema,
  CommonManifestBaseFields,
  EXTENSION_NAME_PATTERN,
  ExtensionNameSchema,
  ExtensionTypePluralSchema,
  ExtensionDependencyConstraintMapSchema,
  ExtensionTypeSchema,
  FQN_PATTERN,
  FullyQualifiedNamePartsSchema,
  FullyQualifiedNameSchema,
  FullyQualifiedRefSchema,
  parseFullyQualifiedRefParts,
  decodeExtensionNameSync,
  extensionTypeFromPlural,
  extensionTypeLabels,
  extensionTypePluralSegments,
  extensionTypePluralLabels,
  extensionTypeToPlural,
  extensionTypes,
  isExtensionType,
  isExtensionTypePlural,
  parseFullyQualifiedNameParts,
  toExtensionType,
  toExtensionTypePlural,
  toAuthor,
  type Author,
  type ExtensionName,
  type ExtensionDependencyConstraintMap,
  type FullyQualifiedNameParts,
  type ExtensionType,
  type ExtensionTypePlural,
  type FullyQualifiedName,
  type FullyQualifiedRef,
} from "./common.js";

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
export { formatFqn, parseFqn, parseFqnOrThrow } from "./fqn.js";

// Constants
export { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "./constants.js";

// Ref base types
export type {
  ExtensionRefBase,
  SkillExtensionRefBase,
  CommandExtensionRefBase,
  McpServerExtensionRefBase,
  ExtensionPackRefBase,
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
  type UninstallOperationArgs,
  type UninstallRetentionPolicy,
  buildInstallOperation,
  buildUninstallOperation,
  formatPackageUrlParts,
  targetFromRef,
  toLabel,
  toLabelWithCompatibility,
} from "./operations.js";
