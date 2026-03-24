/**
 * Extension schemas and types for @axm.sh/core.
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
  MANIFEST_NAMESPACE_PATTERN,
  ManifestNameSchema,
  ManifestNamespaceSchema,
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

// Manifest schemas
export {
  MANIFEST_FILENAME,
  SkillManifestSchema,
  type SkillManifest,
} from "./skills/manifest-schema.js";
export {
  COMMAND_MANIFEST_FILENAME,
  CommandManifestSchema,
  type CommandManifest,
} from "./commands/manifest-schema.js";
export {
  MCP_SERVER_MANIFEST_FILENAME,
  McpServerManifestSchema,
  type McpServerManifest,
} from "./mcp-servers/manifest-schema.js";
export {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
  RawPackManifestSchema,
  type PackManifest,
  type RawPackManifest,
} from "./packs/manifest-schema.js";

// Skill types
export type { Skill } from "./skills/types.js";
