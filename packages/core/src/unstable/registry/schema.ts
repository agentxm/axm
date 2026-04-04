/**
 * Registry layout schemas for extension index and version entries.
 *
 * These schemas define the structure of registry metadata that describes
 * published extensions and their available versions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  AuthorSchema,
  ExtensionDependencyConstraintMapSchema,
  ExtensionTypeSchema,
} from "../extensions/index.js";
import { ExactSemverVersionSchema } from "../version-constraints/index.js";

// =============================================================================
// Version Entry
// =============================================================================

/**
 * A single published version of an extension in the registry.
 *
 * Fields:
 * - version: Semver version string (e.g., "1.2.3")
 * - published: ISO 8601 timestamp of publication
 * - dependencies: Optional map of `@profile/type/name` to semver range
 * - integrity: SRI integrity string in `sha512-<base64>` format
 *
 * @experimental This API is unstable and may change without notice.
 */
export const VersionEntrySchema = Schema.Struct({
  version: ExactSemverVersionSchema,
  published: Schema.String,
  dependencies: Schema.optional(ExtensionDependencyConstraintMapSchema),
  integrity: Schema.String,
});

/**
 * Inferred type for VersionEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type VersionEntry = Schema.Schema.Type<typeof VersionEntrySchema>;

// =============================================================================
// Extension Index
// =============================================================================

/**
 * Extension index metadata describing a published extension in the registry.
 *
 * Fields:
 * - name: Extension name without profile
 * - profile: Profile including `@` prefix (e.g., "@acme")
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
  profile: Schema.String,
  type: ExtensionTypeSchema,
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
export type ExtensionIndex = Schema.Schema.Type<typeof ExtensionIndexSchema>;
