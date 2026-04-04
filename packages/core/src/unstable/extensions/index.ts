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
  CommonManifestFields,
  ExtensionDependencyConstraintMapSchema,
  ExtensionTypeSchema,
  FQN_PATTERN,
  FullyQualifiedNameSchema,
  MANIFEST_NAME_PATTERN,
  MANIFEST_HANDLE_PATTERN,
  ManifestNameSchema,
  ManifestHandleSchema,
  toAuthor,
  type Author,
  type ExtensionDependencyConstraintMap,
  type ExtensionType,
  type FullyQualifiedName,
} from "./common.js";

// FQN parsing
export type { ExtensionTypePlural, Fqn } from "./fqn.js";
export { formatFqn, parseFqn, parseFqnOrThrow } from "./fqn.js";

// Constants
export { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "./constants.js";

// Ref base types
export type {
  ExtensionRefBase,
  SkillExtensionRefBase,
  CommandExtensionRefBase,
  McpServerExtensionRefBase,
  PackExtensionRefBase,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
  BuiltinRefDetails,
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
  targetFromRef,
  toLabel,
} from "./operations.js";
