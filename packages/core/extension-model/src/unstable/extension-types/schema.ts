/**
 * Agent-agnostic extension type catalog schemas.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import type { ExtensionType } from "../extensions/common.js";

// The placement axis lives on EXTENSION_TYPE_TABLE; the derived unions are
// re-exported here so catalog consumers reach the whole type vocabulary through
// one module. Type-only on purpose: extensions/common.js reaches back into the
// agent catalog at runtime, so a value re-export would close an import cycle.
export type {
  PerAgentType,
  WorkspaceCapabilityKey,
  WorkspaceCapabilityType,
} from "../extensions/common.js";

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
  "mcp-server",
  "subagent",
  "rule",
  "hook",
] as const satisfies ReadonlyArray<Exclude<ExtensionType, "pack" | "knowledge">>;

/** @experimental This API is unstable and may change without notice. */
export type LeafExtensionType = (typeof LEAF_EXTENSION_TYPES)[number];

// Coverage witness: the array satisfies-check above only rejects foreign
// members; this fails compile when a non-pack, non-knowledge extension type is
// missing from LEAF_EXTENSION_TYPES.
type _LeafCoversInstallableTypes =
  Exclude<ExtensionType, "pack" | "knowledge" | LeafExtensionType> extends never ? true : false;
const _leafCoversInstallableTypes = true as const satisfies _LeafCoversInstallableTypes;
export type _LeafExtensionTypeCoverage = typeof _leafCoversInstallableTypes;

/** @experimental This API is unstable and may change without notice. */
export const LeafExtensionTypeSchema = Schema.Literals(LEAF_EXTENSION_TYPES).annotate({
  identifier: "LeafExtensionType",
  title: "Leaf Extension Type",
  description: "Installable extension type excluding packs.",
});

/** Registry/package extension types, including workspace-only knowledge bundles. */
export const CATALOG_EXTENSION_TYPES = [
  ...LEAF_EXTENSION_TYPES,
  "knowledge",
] as const satisfies ReadonlyArray<Exclude<ExtensionType, "pack">>;

/** @experimental This API is unstable and may change without notice. */
export type CatalogExtensionType = (typeof CATALOG_EXTENSION_TYPES)[number];

// Coverage witness: fails compile when a non-pack extension type is missing
// from CATALOG_EXTENSION_TYPES.
type _CatalogCoversNonPackTypes =
  Exclude<ExtensionType, "pack" | CatalogExtensionType> extends never ? true : false;
const _catalogCoversNonPackTypes = true as const satisfies _CatalogCoversNonPackTypes;
export type _CatalogExtensionTypeCoverage = typeof _catalogCoversNonPackTypes;

const catalogExtensionTypeSet: ReadonlySet<string> = new Set(CATALOG_EXTENSION_TYPES);

/** @experimental This API is unstable and may change without notice. */
export const isCatalogExtensionType = (type: ExtensionType): type is CatalogExtensionType =>
  catalogExtensionTypeSet.has(type);

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
  docs: Schema.Array(DocLinkSchema).check(
    Schema.makeFilter((docs) =>
      docs.length > 0 ? true : "Every catalog entry needs at least one doc link",
    ),
  ),
})
  .annotate({
    identifier: "ExtensionTypeDefinition",
    title: "Extension Type Definition",
    description: "Agent-agnostic catalog entry describing one leaf extension type's capability.",
  })
  .check(
    Schema.makeFilter((definition) =>
      definition.standard === null ||
      definition.docs.every((doc) => doc.url !== definition.standard?.url)
        ? true
        : "Doc links must be distinct from the governing standard's url",
    ),
  );

/** @experimental This API is unstable and may change without notice. */
export type ExtensionTypeDefinition = Schema.Schema.Type<typeof ExtensionTypeDefinitionSchema>;

/** @experimental This API is unstable and may change without notice. */
export type ExtensionTypeCatalog = {
  readonly [Type in CatalogExtensionType]: ExtensionTypeDefinition;
};

/** @experimental This API is unstable and may change without notice. */
export const ExtensionTypeCatalogSchema = Schema.Struct({
  skill: ExtensionTypeDefinitionSchema,
  "mcp-server": ExtensionTypeDefinitionSchema,
  subagent: ExtensionTypeDefinitionSchema,
  rule: ExtensionTypeDefinitionSchema,
  hook: ExtensionTypeDefinitionSchema,
  knowledge: ExtensionTypeDefinitionSchema,
}).annotate({
  identifier: "ExtensionTypeCatalog",
  title: "Extension Type Catalog",
  description: "Agent-agnostic catalog keyed by leaf extension type.",
});
