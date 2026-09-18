import {
  extensionTypeFromPlural,
  isExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import { detectedPackageName, type DiscoverExtensionsResult } from "@agentxm/workspace/discovery";

import { count, inventoryDoc, type Doc, type Text, type ViewColumn } from "../../screen/index.js";
import { extensionTypeText } from "../inventory-view.js";

/** Stands in for a fact the Registry did not report. */
const NOT_REPORTED = "—";

interface DiscoverTableRow {
  readonly package: string;
  readonly extension: string;
  readonly type: string | undefined;
  readonly attestedBy: ReadonlyArray<string>;
  readonly official: boolean;
  readonly installVersion: string;
}

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
  const side = row.attestedBy.includes("package") ? "package only" : "extension only";
  return [{ text: side, tone: "dim" }, ...(official === "" ? [] : [{ text: official }])];
};

const DiscoverColumns = [
  { header: "Extension", priority: "required", value: (row: DiscoverTableRow) => row.extension },
  {
    header: "Type",
    value: (row: DiscoverTableRow) =>
      row.type === undefined ? NOT_REPORTED : extensionTypeText(row.type),
  },
  { header: "Trust", value: trustText },
  { header: "Install", value: (row: DiscoverTableRow) => row.installVersion },
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
      installVersion: entry.extension?.installVersion ?? NOT_REPORTED,
    })),
  );

/** A Registry that did not answer leaves only what packages declare locally. */
const registryUnavailable: Text = [
  { text: "Registry unavailable, local recommendations only", tone: "warn" },
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
