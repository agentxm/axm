/**
 * Schema definitions for AXM configuration files.
 *
 * Re-exports all schema types for manifests, settings, and lockfiles.
 * Uses Effect Schema (bundled in effect v3.x) for validation and type inference.
 *
 * @experimental This API is unstable and may change without notice.
 */

// Common schemas and types
export type {
  AgentId,
  Author,
  ExtensionType,
  FullyQualifiedName,
  SourceType,
} from "./common.js";
export {
  AgentIdSchema,
  AuthorSchema,
  CommonManifestFields,
  ExtensionTypeSchema,
  FullyQualifiedNameSchema,
  SourceTypeSchema,
} from "./common.js";
export type { CommandManifest } from "./manifest-command.js";
export { CommandManifestSchema } from "./manifest-command.js";
export type { McpServerManifest } from "./manifest-mcp-server.js";
export { McpServerManifestSchema } from "./manifest-mcp-server.js";
export type { PackManifest } from "./manifest-pack.js";
export { PackManifestSchema } from "./manifest-pack.js";
// Manifest schemas and types
export type { SkillManifest } from "./manifest-skill.js";
export { SkillManifestSchema } from "./manifest-skill.js";
