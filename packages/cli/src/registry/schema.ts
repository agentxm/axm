/**
 * Registry layout schemas for extension index and version entries.
 *
 * These schemas define the structure of registry metadata that describes
 * published extensions and their available versions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { AuthorSchema } from "../extensions/common.js";

// =============================================================================
// Version Entry
// =============================================================================

/**
 * A single published version of an extension in the registry.
 *
 * Fields:
 * - version: Semver version string (e.g., "1.2.3")
 * - published: ISO 8601 timestamp of publication
 * - agents: Agent identifiers this version supports (plain strings for forward compatibility)
 * - dependencies: Optional map of `@scope/name` to semver range
 * - engines: Optional map of engine constraints (e.g., `{"axm": ">=0.2.0"}`)
 * - checksum: Content hash in `sha256:<hex>` format
 *
 * @experimental This API is unstable and may change without notice.
 */
export const VersionEntrySchema = Schema.Struct({
  version: Schema.String,
  published: Schema.String,
  agents: Schema.Array(Schema.String),
  dependencies: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  engines: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  checksum: Schema.String,
});

/**
 * Inferred type for VersionEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type VersionEntry = typeof VersionEntrySchema.Type;

// =============================================================================
// Extension Index
// =============================================================================

/**
 * Extension type within the registry — "skill", "mcp-server", or "pack".
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryExtensionTypeSchema = Schema.Union(
  Schema.Literal("skill"),
  Schema.Literal("mcp-server"),
  Schema.Literal("pack"),
);

/**
 * Inferred type for RegistryExtensionType schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RegistryExtensionType = typeof RegistryExtensionTypeSchema.Type;

/**
 * Extension index metadata describing a published extension in the registry.
 *
 * Fields:
 * - name: Extension name without scope
 * - scope: Scope including `@` prefix (e.g., "@acme")
 * - type: Extension type ("skill", "mcp-server", or "pack")
 * - description: Optional human-readable description
 * - repository: Optional repository URL
 * - license: Optional SPDX license identifier
 * - authors: Optional list of authors
 * - versions: Array of version entries, newest first
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionIndexSchema = Schema.Struct({
  name: Schema.String,
  scope: Schema.String,
  type: RegistryExtensionTypeSchema,
  description: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.Array(AuthorSchema)),
  versions: Schema.Array(VersionEntrySchema),
});

/**
 * Inferred type for ExtensionIndex schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionIndex = typeof ExtensionIndexSchema.Type;
