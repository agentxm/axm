/**
 * Agent-agnostic extension type catalog schemas.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { type ExtensionType } from "../extensions/common.js";

const isUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

/** @experimental This API is unstable and may change without notice. */
export const LEAF_EXTENSION_TYPES = [
  "skill",
  "command",
  "mcp-server",
  "subagent",
  "files",
  "rule",
  "hook",
] as const satisfies ReadonlyArray<ExtensionType>;

/** @experimental This API is unstable and may change without notice. */
export type LeafExtensionType = (typeof LEAF_EXTENSION_TYPES)[number];

/** @experimental This API is unstable and may change without notice. */
export const LeafExtensionTypeSchema = Schema.Literals(LEAF_EXTENSION_TYPES).annotate({
  identifier: "LeafExtensionType",
  title: "Leaf Extension Type",
  description: "Installable extension type excluding packs.",
});

/** Registry/package extension types, including workspace-only knowledge bundles. */
export const CATALOG_EXTENSION_TYPES = [...LEAF_EXTENSION_TYPES, "knowledge"] as const;

/** @experimental This API is unstable and may change without notice. */
export type CatalogExtensionType = (typeof CATALOG_EXTENSION_TYPES)[number];

/** @experimental This API is unstable and may change without notice. */
export const CatalogExtensionTypeSchema = Schema.Literals(CATALOG_EXTENSION_TYPES).annotate({
  identifier: "CatalogExtensionType",
  title: "Catalog Extension Type",
  description: "Non-pack extension types represented by the AgentXM registry.",
});

/** @experimental This API is unstable and may change without notice. */
export const UrlSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => (isUrl(value) ? undefined : `Expected URL, got ${value}`)),
  ),
).annotate({
  identifier: "Url",
  title: "URL",
  description: "Absolute URL string.",
  examples: ["https://example.com/docs"],
});

/** @experimental This API is unstable and may change without notice. */
export type Url = Schema.Schema.Type<typeof UrlSchema>;

/** @experimental This API is unstable and may change without notice. */
export const StandardSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  url: UrlSchema,
}).annotate({
  identifier: "Standard",
  title: "Standard",
  description: "Open standard that is authoritative for an extension type's capability.",
});

/** @experimental This API is unstable and may change without notice. */
export type Standard = Schema.Schema.Type<typeof StandardSchema>;

/** @experimental This API is unstable and may change without notice. */
export const DocLinkSchema = Schema.Struct({
  label: Schema.NonEmptyString,
  url: UrlSchema,
}).annotate({
  identifier: "DocLink",
  title: "Documentation Link",
  description: "Documentation reference for an agent or capability.",
});

/** @experimental This API is unstable and may change without notice. */
export type DocLink = Schema.Schema.Type<typeof DocLinkSchema>;

/** @experimental This API is unstable and may change without notice. */
export const ExtensionTypeDefinitionSchema = Schema.Struct({
  id: CatalogExtensionTypeSchema,
  summary: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  standard: Schema.NullOr(StandardSchema),
  docs: Schema.Array(DocLinkSchema),
}).annotate({
  identifier: "ExtensionTypeDefinition",
  title: "Extension Type Definition",
  description: "Agent-agnostic catalog entry describing one leaf extension type's capability.",
});

/** @experimental This API is unstable and may change without notice. */
export type ExtensionTypeDefinition = Schema.Schema.Type<typeof ExtensionTypeDefinitionSchema>;

/** @experimental This API is unstable and may change without notice. */
export type ExtensionTypeCatalog = {
  readonly [Type in CatalogExtensionType]: ExtensionTypeDefinition;
};

/** @experimental This API is unstable and may change without notice. */
export const ExtensionTypeCatalogSchema = Schema.Struct({
  skill: ExtensionTypeDefinitionSchema,
  command: ExtensionTypeDefinitionSchema,
  "mcp-server": ExtensionTypeDefinitionSchema,
  subagent: ExtensionTypeDefinitionSchema,
  files: ExtensionTypeDefinitionSchema,
  rule: ExtensionTypeDefinitionSchema,
  hook: ExtensionTypeDefinitionSchema,
  knowledge: ExtensionTypeDefinitionSchema,
}).annotate({
  identifier: "ExtensionTypeCatalog",
  title: "Extension Type Catalog",
  description: "Agent-agnostic catalog keyed by leaf extension type.",
});
