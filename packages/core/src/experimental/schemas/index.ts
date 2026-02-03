/**
 * Schema definitions for AXM configuration files.
 *
 * Re-exports all schema types for manifests, settings, and lockfiles.
 * Uses Effect Schema (bundled in effect v3.x) for validation and type inference.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type {
  AgentId as AgentIdType,
  Author as AuthorType,
  ExtensionType as ExtensionTypeType,
  FullyQualifiedName as FullyQualifiedNameType,
  SourceType as SourceTypeType,
} from "./common.js";
// Common schemas (shared fields and types)
export {
  AgentId,
  Author,
  CommonManifestFields,
  ExtensionType,
  FullyQualifiedName,
  SourceType,
} from "./common.js";
export type { CommandManifest as CommandManifestType } from "./manifest-command.js";
export { CommandManifest } from "./manifest-command.js";
export type { McpServerManifest as McpServerManifestType } from "./manifest-mcp-server.js";
export { McpServerManifest } from "./manifest-mcp-server.js";
export type { PackManifest as PackManifestType } from "./manifest-pack.js";
export { PackManifest } from "./manifest-pack.js";
export type { SkillManifest as SkillManifestType } from "./manifest-skill.js";
// Manifest schemas
export { SkillManifest } from "./manifest-skill.js";

// Schema modules will be re-exported here as they are created:
// - settings.ts
// - lockfile.ts
