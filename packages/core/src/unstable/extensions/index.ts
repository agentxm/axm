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
  ExtensionTypeSchema,
  FQN_PATTERN,
  FullyQualifiedNameSchema,
  MANIFEST_NAME_PATTERN,
  MANIFEST_HANDLE_PATTERN,
  ManifestNameSchema,
  ManifestHandleSchema,
  toAuthor,
  type Author,
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

// Extension ref types (union + per-type)
export type {
  ExtensionRef,
  // Skill refs
  GitHostedSkillRef,
  RegistrySkillRef,
  LocalSkillRef,
  BuiltinSkillRef,
  SkillExtensionRef,
  // Command refs
  GitHostedCommandRef,
  RegistryCommandRef,
  LocalCommandRef,
  BuiltinCommandRef,
  CommandExtensionRef,
  // MCP server refs
  GitHostedMcpServerRef,
  RegistryMcpServerRef,
  LocalMcpServerRef,
  BuiltinMcpServerRef,
  McpServerExtensionRef,
  // Pack refs
  RegistryPackRef,
  BuiltinPackRef,
  PackExtensionRef,
} from "./refs.js";

// Shared utilities
export { sanitizeName, copyExtensionDirectory, copySkillDirectory } from "./utils.js";

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
