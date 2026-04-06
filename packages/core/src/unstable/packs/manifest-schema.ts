/**
 * Pack manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestFields,
  ExtensionDependencyConstraintMapSchema,
} from "../extensions/common.js";
import { HandleSchema, type Handle } from "../extensions/handle.js";

export const PACK_MANIFEST_FILENAME = "axm-pack.json";

/**
 * Raw pack manifest JSON shape (no schema validation on read to allow editing).
 */
export interface RawPackManifest {
  readonly owner: Handle;
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
  owner: HandleSchema,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  skills: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  commands: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  "mcp-servers": Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

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
  skills: Schema.optional(ExtensionDependencyConstraintMapSchema),
  commands: Schema.optional(ExtensionDependencyConstraintMapSchema),
  "mcp-servers": Schema.optional(ExtensionDependencyConstraintMapSchema),
});

/**
 * Inferred type for PackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackManifest = Schema.Schema.Type<typeof PackManifestSchema>;
