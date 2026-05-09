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

export const PACK_MANIFEST_FILENAME = "pack.json";

export const PACK_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/pack.schema.json";

/**
 * Schema for pack manifest files (pack.json).
 *
 * Packs bundle multiple extensions (skills, commands, MCP servers, subagents)
 * for convenient distribution and installation. Each extension entry
 * maps a fully qualified name to a semver version range.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  type: Schema.Literal("pack"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "pack name is required" }),
  ),
  skills: Schema.optional(ExtensionDependencyConstraintMapSchema),
  commands: Schema.optional(ExtensionDependencyConstraintMapSchema),
  "mcp-servers": Schema.optional(ExtensionDependencyConstraintMapSchema),
  subagents: Schema.optional(ExtensionDependencyConstraintMapSchema),
}).annotate({
  identifier: "PackManifest",
  title: "Pack Manifest",
  description:
    "Configuration file (pack.json) that bundles multiple extensions into a single installable pack.",
});

/**
 * Inferred type for PackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackManifest = Schema.Schema.Type<typeof PackManifestSchema>;
