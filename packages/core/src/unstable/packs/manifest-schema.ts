/**
 * Pack manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackExtensionDependencyConstraintMapSchema,
} from "../extensions/common.js";

export const PACK_MANIFEST_FILENAME = "pack.json";

export const PACK_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/pack.schema.json";

/**
 * Schema for pack manifest files (pack.json).
 *
 * Packs bundle multiple extensions (skills, MCP servers, subagents, rules,
 * hooks, and knowledge bundles) for convenient distribution and installation. Each extension entry
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
    Schema.annotate({
      description:
        "Short name for this pack within its owner namespace. Combined with owner, forms the FQN @owner/packs/<name>.",
    }),
  ),
  dependencies: NonPackExtensionDependencyConstraintMapSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "pack dependencies are required" }),
    Schema.annotate({
      description:
        "Install-time extension constraints. AXM resolves and installs a member version satisfying each range; `axm packs add` writes a caret range rooted at the current resolved version. Caret ranges below 1.0 have narrower compatibility boundaries and require review more often. These constraints select installed extension versions, unlike companion-package recommendation ranges in `packages`, which are metadata only.",
    }),
  ),
}).annotate({
  identifier: "PackManifest",
  title: "Pack Manifest",
  description:
    "Extension manifest file for extension packs. Bundles a curated set of skills, MCP servers, subagents, rules, hooks, and knowledge bundles into a single installable unit.",
});

/**
 * Inferred type for PackManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackManifest = Schema.Schema.Type<typeof PackManifestSchema>;
