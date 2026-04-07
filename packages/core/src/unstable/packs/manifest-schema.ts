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

export const EXTENSION_PACK_MANIFEST_FILENAME = "extension-pack.json";

export const EXTENSION_PACK_MANIFEST_SCHEMA_URL =
  "https://axm.sh/schemas/extension-pack.schema.json";

/**
 * Schema for pack manifest files (extension-pack.json).
 *
 * Extension packs bundle multiple extensions (skills, commands, MCP servers)
 * for convenient distribution and installation. Each extension entry
 * maps a fully qualified name to a semver version range.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionPackManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
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
    "Configuration file (extension-pack.json) that bundles multiple extensions into a single installable pack.",
});

/**
 * Inferred type for ExtensionPackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionPackManifest = Schema.Schema.Type<typeof ExtensionPackManifestSchema>;
