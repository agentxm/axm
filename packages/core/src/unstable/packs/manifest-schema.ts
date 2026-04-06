/**
 * Pack manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestBaseFields,
  ExtensionDependencyConstraintMapSchema,
  ExtensionNameSchema,
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
  owner: HandleSchema.pipe(Schema.annotateKey({ messageMissingKey: "pack owner is required" })),
  type: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "pack type is required" })),
  name: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "pack name is required" })),
  version: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "pack version is required" }),
  ),
  skills: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  commands: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  "mcp-servers": Schema.optional(Schema.Record(Schema.String, Schema.String)),
}).annotate({
  identifier: "RawPackManifest",
  title: "Raw Pack Manifest",
  description: "Loosely validated pack manifest for editing workflows.",
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
  ...CommonManifestBaseFields,
  type: Schema.Literal("pack"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "pack name is required" }),
  ),
  skills: Schema.optional(ExtensionDependencyConstraintMapSchema),
  commands: Schema.optional(ExtensionDependencyConstraintMapSchema),
  "mcp-servers": Schema.optional(ExtensionDependencyConstraintMapSchema),
}).annotate({
  identifier: "PackManifest",
  title: "Pack Manifest",
  description:
    "Configuration file (axm-pack.json) that bundles multiple extensions into a single installable pack.",
});

/**
 * Inferred type for PackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackManifest = Schema.Schema.Type<typeof PackManifestSchema>;
