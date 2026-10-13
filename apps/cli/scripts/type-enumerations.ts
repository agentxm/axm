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

import { scanFences, type FenceLine } from "@agentxm/workspace-kernel/agent-adapters";

/** One extension type, flattened to just what the prose blocks need. */
export interface TypeEnumerationRow {
  readonly plural: string;
  readonly pluralLabel: string;
  readonly pluralSentenceLabel: string;
  /** Catalog summary, or `null` for a type the catalog does not describe. */
  readonly summary: string | null;
  readonly standard: { readonly name: string; readonly url: string } | null;
}

/**
 * Names of the build-time regions this generator owns. They share the runtime
 * fence grammar (`<!-- axm:<name> -->` … `<!-- /axm:<name> -->`) but never the
 * runtime vocabulary, so a generated document cannot be mistaken for a region
 * AXM writes into a workspace. Generators strip these fences before publishing
 * rendered help or bundled workspace artifacts.
 */
export const BUILD_TIME_REGION_NAMES = [
  "extension-types-table",
  "extension-type-namespaces",
  "extension-type-list",
] as const;

export type BuildTimeRegionName = (typeof BUILD_TIME_REGION_NAMES)[number];

const isBuildTimeRegionName = (value: string): value is BuildTimeRegionName =>
  BUILD_TIME_REGION_NAMES.some((name) => name === value);

/** The fence lines in `source` that name a build-time region. */
const buildTimeFences = (source: string): ReadonlyArray<FenceLine> =>
  scanFences(source, "markdown").filter(({ name }) => isBuildTimeRegionName(name));

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

export const buildRegionBlocks = (
  rows: ReadonlyArray<TypeEnumerationRow>,
): Record<BuildTimeRegionName, string> => ({
  "extension-types-table": extensionTypesTableBlock(rows),
  "extension-type-namespaces": extensionTypeNamespacesBlock(rows),
  "extension-type-list": extensionTypeListBlock(rows),
});

export interface RegionRewrite {
  readonly content: string;
  readonly regions: ReadonlyArray<BuildTimeRegionName>;
}

/**
 * Replaces the body of every build-time region present in `source`. A region
 * the document does not open is left alone; an opened region without its own
 * closing fence, or opened twice, throws rather than guessing where the body
 * ends. Fences inside fenced code blocks are not fences.
 */
export const rewriteManagedRegions = (
  source: string,
  blocks: Readonly<Record<BuildTimeRegionName, string>>,
): RegionRewrite => {
  let content = source;
  const regions: Array<BuildTimeRegionName> = [];

  for (const region of BUILD_TIME_REGION_NAMES) {
    const fences = buildTimeFences(content).filter(({ name }) => name === region);
    const opens = fences.filter(({ edge }) => edge === "open");
    const open = opens[0];
    if (open === undefined) continue;
    if (opens.length > 1) {
      throw new Error(`Managed region '${region}' is opened more than once`);
    }
    const close = fences.find(({ edge, start }) => edge === "close" && start >= open.end);
    if (close === undefined) {
      throw new Error(`Managed region '${region}' is missing its <!-- /axm:${region} --> marker`);
    }
    content = `${content.slice(0, open.end)}\n${blocks[region]}\n\n${content.slice(close.start)}`;
    regions.push(region);
  }

  return { content, regions };
};

/**
 * Drops the build-time fences, so rendered help never shows generator plumbing.
 * Removing a fence line would otherwise leave the blank lines that surrounded
 * it stacked, so runs of blank lines collapse back to one.
 */
export const stripRegionMarkers = (source: string): string =>
  [...buildTimeFences(source)]
    .reverse()
    .reduce(
      (content, fence) => `${content.slice(0, fence.start)}${content.slice(fence.end)}`,
      source,
    )
    .replace(/\n{3,}/g, "\n\n");
