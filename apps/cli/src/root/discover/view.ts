import {
  extensionTypeFromPlural,
  isExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import { detectedPackageName, type DiscoverExtensionsResult } from "@agentxm/workspace/discovery";

import {
  ABSENT,
  count,
  inventoryDoc,
  type Doc,
  type Text,
  type ViewColumn,
} from "../../screen/index.js";
import { extensionTypeText } from "../inventory-view.js";

interface DiscoverTableRow {
  readonly package: string;
  readonly extension: string;
  readonly type: string | undefined;
  readonly attestedBy: ReadonlyArray<string>;
  readonly official: boolean;
  readonly resolution: string;
  readonly source: string;
}

const sourceText = (
  source: DiscoverExtensionsResult["packages"][number]["extensions"][number]["source"],
): string => {
  switch (source.type) {
    case "registry":
      return source.url.href;
    case "git": {
      const revision = source.revision === undefined ? "" : `#${source.revision}`;
      const path = source.path === undefined ? "" : `:${source.path}`;
      return `${source.url.href}${revision}${path}`;
    }
    case "path":
      return source.path;
  }
};

const resolutionText = (
  resolution:
    | NonNullable<
        DiscoverExtensionsResult["packages"][number]["extensions"][number]["extension"]
      >["resolution"]
    | undefined,
): string => {
  if (resolution === undefined) {
    return ABSENT;
  }
  switch (resolution.type) {
    case "registry":
      return resolution.version;
    case "git": {
      const revision = resolution.revision === undefined ? "" : `#${resolution.revision}`;
      const path = resolution.path === undefined ? "" : `:${resolution.path}`;
      return `${resolution.url.href}${revision}${path}`;
    }
    case "path":
      return resolution.path;
  }
};

/**
 * How far a recommendation is vouched for: `attested` when the package and
 * the extension each name the other, the one side that does otherwise, and
 * `official` when the Registry marks it so.
 */
const trustText = (row: DiscoverTableRow): Text => {
  const official = row.official ? ", official" : "";
  if (row.attestedBy.includes("package") && row.attestedBy.includes("extension")) {
    return `attested${official}`;
  }
  const side = row.attestedBy.includes("package")
    ? "package only"
    : row.attestedBy.includes("extension")
      ? "extension only"
      : "not attested";
  return [{ text: side, tone: "dim" }, ...(official === "" ? [] : [{ text: official }])];
};

const DiscoverColumns = [
  { header: "Extension", priority: "required", value: (row: DiscoverTableRow) => row.extension },
  {
    header: "Type",
    value: (row: DiscoverTableRow) =>
      row.type === undefined ? ABSENT : extensionTypeText(row.type),
  },
  { header: "Trust", value: trustText },
  { header: "Resolution", value: (row: DiscoverTableRow) => row.resolution },
  { header: "Source", priority: "optional", value: (row: DiscoverTableRow) => row.source },
  { header: "For package", priority: "optional", value: (row: DiscoverTableRow) => row.package },
] satisfies ReadonlyArray<ViewColumn<DiscoverTableRow>>;

/** The Registry may name a type by its plural route segment; the table names it singular. */
const singularType = (type: string | undefined): string | undefined =>
  isExtensionTypePlural(type) ? extensionTypeFromPlural[type] : type;

const toDiscoverTableRows = (result: DiscoverExtensionsResult): ReadonlyArray<DiscoverTableRow> =>
  result.packages.flatMap((pkg) =>
    pkg.extensions.map((entry) => ({
      package: detectedPackageName(pkg),
      extension: entry.ref,
      type: singularType(entry.extension?.type),
      attestedBy: entry.attestedBy,
      official: entry.official,
      resolution: resolutionText(entry.extension?.resolution),
      source: sourceText(entry.source),
    })),
  );

/** A Registry that did not answer leaves its recommendations unresolved. */
const registryUnavailable: Text = [
  { text: "One or more Registry sources unavailable", tone: "warn" },
];

const discoverSummary = (
  result: DiscoverExtensionsResult,
  rowCount: number,
): ReadonlyArray<Text> => [
  `${count(rowCount, "companion extension")} for ${String(result.document.count)} of ${count(result.document.totalDetected, "detected package")}`,
  ...(result.registryAvailable ? [] : [registryUnavailable]),
  [{ text: "axm view <extension> for details", tone: "dim" }],
];

/** Nothing to recommend: say what was looked at, so an empty answer is still an answer. */
const emptyDiscoverDoc = (result: DiscoverExtensionsResult): Doc => [
  {
    _tag: "paragraph",
    text:
      result.document.totalDetected === 0
        ? "No dependencies detected in this project."
        : `No companion extensions for the ${count(result.document.totalDetected, "package")} this project depends on.`,
  },
  ...(result.registryAvailable ? [] : [{ _tag: "paragraph", text: registryUnavailable } as const]),
];

/**
 * `axm discover` for a person: the recommended companions as a table with
 * their type and trust, the summary after it, or what was looked at when
 * nothing was found.
 */
export const discoverDoc = (result: DiscoverExtensionsResult): Doc => {
  const rows = toDiscoverTableRows(result);
  return inventoryDoc({
    rows,
    columns: DiscoverColumns,
    summary: discoverSummary(result, rows.length),
    empty: emptyDiscoverDoc(result),
  });
};
