/**
 * Catalog-derived prose blocks and the managed-region rewriter that installs
 * them into hand-written Markdown.
 *
 * Extension types are enumerated in README files, help topics, and the bundled
 * skill. Those lists went stale one type at a time, so the enumerations now
 * live inside marked regions that this module regenerates from the extension
 * type table. Everything here is pure — the entry point
 * (`generate-type-enumerations.ts`) owns reading, formatting, and writing — so
 * the block shapes and the rewriter are unit-testable without a filesystem.
 */

/** One extension type, flattened to just what the prose blocks need. */
export interface TypeEnumerationRow {
  readonly plural: string;
  readonly pluralLabel: string;
  readonly pluralSentenceLabel: string;
  /** Catalog summary, or `null` for a type the catalog does not describe. */
  readonly summary: string | null;
  readonly standard: { readonly name: string; readonly url: string } | null;
}

export const REGION_NAMES = [
  "extension-types-table",
  "extension-type-namespaces",
  "extension-type-list",
  "extension-type-namespace-set",
] as const;

export type RegionName = (typeof REGION_NAMES)[number];

export const openMarker = (region: RegionName): string => `<!-- axm:generated:${region} -->`;

export const CLOSE_MARKER = "<!-- /axm:generated -->";

/** Matches either marker on its own line, for stripping before rendering. */
export const MARKER_LINE_PATTERN = /^[ \t]*<!-- \/?axm:generated(?::[a-z-]+)? -->[ \t]*\r?\n?/gm;

const escapeCell = (value: string): string => value.replace(/\|/g, "\\|");

/** Oxford-comma join: `a`, `a and b`, `a, b, and c`. */
const joinPhrase = (items: ReadonlyArray<string>): string => {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
};

/**
 * The extension type table, one row per catalog-described type. Types the
 * catalog does not describe (containers such as packs) are covered by the prose
 * around the region instead, because they have no summary to render.
 */
export const extensionTypesTableBlock = (rows: ReadonlyArray<TypeEnumerationRow>): string => {
  const body = rows.flatMap((row) =>
    row.summary === null
      ? []
      : [
          `| **${escapeCell(row.pluralLabel)}** | ${escapeCell(row.summary)} | ${
            row.standard === null ? "—" : `[${escapeCell(row.standard.name)}](${row.standard.url})`
          } |`,
        ],
  );

  return ["| Type | What it is | Governing standard |", "| --- | --- | --- |", ...body].join("\n");
};

export const extensionTypeNamespacesBlock = (rows: ReadonlyArray<TypeEnumerationRow>): string => {
  const namespaces = rows.map((row) => `\`axm ${row.plural}\``);
  return (
    `Every type has its own subcommand namespace (${namespaces.join(", ")}) ` +
    "sharing a common shape: `install`, `uninstall`, `list`, `update`, `new`, " +
    "`publish`, plus `enable`/`disable` where it applies."
  );
};

export const extensionTypeListBlock = (rows: ReadonlyArray<TypeEnumerationRow>): string =>
  `AXM manages ${joinPhrase(rows.map((row) => row.pluralSentenceLabel))}.`;

export const extensionTypeNamespaceSetBlock = (rows: ReadonlyArray<TypeEnumerationRow>): string =>
  `\`<type>\` ∈ {${rows.map((row) => `\`${row.plural}\``).join(", ")}}`;

export const buildRegionBlocks = (
  rows: ReadonlyArray<TypeEnumerationRow>,
): Record<RegionName, string> => ({
  "extension-types-table": extensionTypesTableBlock(rows),
  "extension-type-namespaces": extensionTypeNamespacesBlock(rows),
  "extension-type-list": extensionTypeListBlock(rows),
  "extension-type-namespace-set": extensionTypeNamespaceSetBlock(rows),
});

export interface RegionRewrite {
  readonly content: string;
  readonly regions: ReadonlyArray<RegionName>;
}

/**
 * Replaces the body of every managed region present in `source`. A region the
 * document does not open is left alone; an opened region without a closing
 * marker, or opened twice, throws rather than guessing where the body ends.
 */
export const rewriteManagedRegions = (
  source: string,
  blocks: Readonly<Record<RegionName, string>>,
): RegionRewrite => {
  let content = source;
  const regions: Array<RegionName> = [];

  for (const region of REGION_NAMES) {
    const open = openMarker(region);
    const openIndex = content.indexOf(open);
    if (openIndex === -1) continue;
    if (content.indexOf(open, openIndex + open.length) !== -1) {
      throw new Error(`Managed region '${region}' is opened more than once`);
    }
    const bodyStart = openIndex + open.length;
    const closeIndex = content.indexOf(CLOSE_MARKER, bodyStart);
    if (closeIndex === -1) {
      throw new Error(`Managed region '${region}' is missing its ${CLOSE_MARKER} marker`);
    }
    content = `${content.slice(0, bodyStart)}\n\n${blocks[region]}\n\n${content.slice(closeIndex)}`;
    regions.push(region);
  }

  return { content, regions };
};

/**
 * Drops the region markers, so rendered help never shows generator plumbing.
 * Removing a marker line would otherwise leave the blank lines that surrounded
 * it stacked, so runs of blank lines collapse back to one.
 */
export const stripRegionMarkers = (source: string): string =>
  source.replace(MARKER_LINE_PATTERN, "").replace(/\n{3,}/g, "\n\n");
