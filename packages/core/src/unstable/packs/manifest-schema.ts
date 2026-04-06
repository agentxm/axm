/**
 * Extension pack manifest schema definition.
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

export const EXTENSION_PACK_MANIFEST_FILENAME = "axm-pack.json";

/**
 * Raw extension pack manifest JSON shape (no schema validation on read to allow editing).
 */
export interface RawExtensionPackManifest {
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
 * Loose structural validation for raw extension pack manifests.
 * Validates basic shape (name, version, optional string maps) without FQN enforcement.
 * Used for read-then-edit workflows where the full ExtensionPackManifestSchema is too strict.
 */
export const RawExtensionPackManifestSchema = Schema.Struct({
  owner: HandleSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "extension pack owner is required" }),
  ),
  type: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "extension pack type is required" }),
  ),
  name: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "extension pack name is required" }),
  ),
  version: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "extension pack version is required" }),
  ),
  skills: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  commands: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  "mcp-servers": Schema.optional(Schema.Record(Schema.String, Schema.String)),
}).annotate({
  identifier: "RawExtensionPackManifest",
  title: "Raw Extension Pack Manifest",
  description: "Loosely validated extension pack manifest for editing workflows.",
});

/**
 * Schema for pack manifest files (axm-pack.json).
 *
 * Extension packs bundle multiple extensions (skills, commands, MCP servers)
 * for convenient distribution and installation. Each extension entry
 * maps a fully qualified name to a semver version range.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionPackManifestSchema = Schema.Struct({
  ...CommonManifestBaseFields,
  type: Schema.Literal("pack"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "extension pack name is required" }),
  ),
  skills: Schema.optional(ExtensionDependencyConstraintMapSchema),
  commands: Schema.optional(ExtensionDependencyConstraintMapSchema),
  "mcp-servers": Schema.optional(ExtensionDependencyConstraintMapSchema),
}).annotate({
  identifier: "ExtensionPackManifest",
  title: "Extension Pack Manifest",
  description:
    "Configuration file (axm-pack.json) that bundles multiple extensions into a single installable pack.",
});

/**
 * Inferred type for ExtensionPackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionPackManifest = Schema.Schema.Type<typeof ExtensionPackManifestSchema>;
