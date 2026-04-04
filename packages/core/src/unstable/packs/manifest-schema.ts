/**
 * Pack manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestFields,
  ExtensionDependencyConstraintMapSchema,
  type ExtensionDependencyConstraintMap,
} from "../extensions/common.js";

export const PACK_MANIFEST_FILENAME = "axm-pack.json";

/**
 * Raw pack manifest JSON shape (no schema validation on read to allow editing).
 */
export interface RawPackManifest {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly skills?: Record<string, string>;
  readonly commands?: Record<string, string>;
  readonly "mcp-servers"?: Record<string, string>;
  readonly [key: string]: unknown;
}

/**
 * Loose structural validation for raw pack manifests.
 * Validates basic shape (name, version, optional string maps) without FQN enforcement.
 * Used for read-then-edit workflows where the full PackManifestSchema is too strict.
 */
export const RawPackManifestSchema = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  skills: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  commands: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  "mcp-servers": Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

/**
 * Version specifier map: FQN keys to semver range values.
 * Used for skills, commands, and mcp-servers in pack manifests.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackDependencyConstraintMapSchema = ExtensionDependencyConstraintMapSchema;

/**
 * Inferred type for pack dependency constraint maps.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackDependencyConstraintMap = ExtensionDependencyConstraintMap;

/**
 * Schema for pack manifest files (axm-pack.json).
 *
 * Packs bundle multiple extensions (skills, commands, MCP servers)
 * for convenient distribution and installation. Each extension entry
 * maps a fully qualified name to a semver version range.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackManifestSchema = Schema.Struct({
  ...CommonManifestFields,
  type: Schema.Literal("pack"),
  skills: Schema.optional(PackDependencyConstraintMapSchema),
  commands: Schema.optional(PackDependencyConstraintMapSchema),
  "mcp-servers": Schema.optional(PackDependencyConstraintMapSchema),
});

/**
 * Inferred type for PackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackManifest = Schema.Schema.Type<typeof PackManifestSchema>;
