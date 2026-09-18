import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type {
  ExtensionListDocument,
  ExtensionListFilter,
  ExtensionListItem,
} from "@agentxm/workspace/inspection";

import {
  count,
  inventoryDoc,
  paragraphDoc,
  suggestionsDoc,
  type Doc,
  type Text,
  type ViewColumn,
} from "../../screen/index.js";
import { extensionTypeText } from "../inventory-view.js";

interface ListTableRow {
  readonly extension: string;
  readonly type: InstallableExtensionType;
  readonly management: ExtensionListItem["management"];
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly version: string;
  readonly source: string;
  readonly state: ExtensionListItem["assessment"]["state"];
  readonly guidance: string;
}

/** What `axm lint` reports on: an installation desired state no longer reaches, or one that is missing. */
const lintExplains = (row: ListTableRow): boolean =>
  row.management === "leftover" || !row.installed;

const needsAttention = (row: ListTableRow): boolean =>
  lintExplains(row) || row.state === "deprecated";

const attention = (value: string, flagged: boolean): Text =>
  flagged ? [{ text: value, tone: "warn" }] : value;

const ExtensionListColumns = [
  { header: "Extension", priority: "required", value: (row: ListTableRow) => row.extension },
  { header: "Type", value: (row: ListTableRow) => extensionTypeText(row.type) },
  {
    header: "Management",
    value: (row: ListTableRow) => attention(row.management, row.management === "leftover"),
  },
  {
    header: "Installed",
    value: (row: ListTableRow) => attention(row.installed ? "yes" : "missing", !row.installed),
  },
  { header: "Version", value: (row: ListTableRow) => row.version },
  { header: "Source", priority: "optional", value: (row: ListTableRow) => row.source },
  {
    header: "Assessment",
    value: (row: ListTableRow) => attention(row.state, row.state === "deprecated"),
  },
  { header: "Guidance", priority: "optional", value: (row: ListTableRow) => row.guidance },
] satisfies ReadonlyArray<ViewColumn<ListTableRow>>;

const guidanceFor = (item: ExtensionListItem, filter: ExtensionListFilter): string => {
  if (filter === "all") {
    return item.assessment.state === "deprecated" ? `axm view ${item.ref} deprecation` : "-";
  }
  const deprecation = item.assessment.deprecation;
  if (deprecation === undefined) return "-";
  const replacement = deprecation.replacement;
  return [
    deprecation.message,
    replacement?.status === "available"
      ? `Use ${replacement.fqn}`
      : replacement === undefined
        ? undefined
        : replacement.fqn === undefined
          ? "Replacement unavailable or not visible"
          : `Replacement ${replacement.fqn} unavailable`,
  ]
    .filter((value): value is string => value !== undefined)
    .join("; ");
};

const toRow = (item: ExtensionListItem, filter: ExtensionListFilter): ListTableRow => ({
  extension: item.ref,
  type: item.type,
  management: item.management,
  installed: item.installed,
  enabled: item.enabled === true,
  version: item.version ?? "-",
  source: item.sourceName ?? item.source ?? "-",
  state: item.assessment.state,
  guidance: guidanceFor(item, filter),
});

/**
 * The inventory's closing sentence: how many, how many are enabled, and —
 * when a row is flagged — how many need attention and where that is explained.
 */
const inventorySentence = (rows: ReadonlyArray<ListTableRow>): ReadonlyArray<Text> => {
  const flagged = rows.filter(needsAttention).length;
  return [
    count(rows.length, "extension"),
    `${String(rows.filter((row) => row.enabled).length)} enabled`,
    ...(flagged === 0
      ? []
      : [
          [
            {
              text: `${String(flagged)} ${flagged === 1 ? "needs" : "need"} attention`,
              tone: "warn",
            },
          ] satisfies Text,
        ]),
    ...(rows.some(lintExplains)
      ? [[{ text: "axm lint explains", tone: "dim" }] satisfies Text]
      : []),
  ];
};

/** Where an inventory with nothing in it stands, which decides what it says next. */
type EmptyInventory = "no-workspace" | "empty-project" | "empty-user";

/** An empty inventory says what is true, then the one command that moves on. */
export const emptyInventoryDoc = (state: EmptyInventory): Doc => {
  switch (state) {
    case "no-workspace":
      return [
        ...paragraphDoc("No AXM workspace in this project."),
        ...suggestionsDoc([{ description: "Set up AXM in this project", cmd: "axm setup" }]),
      ];
    case "empty-project":
      return [
        ...paragraphDoc("No extensions installed in this project."),
        ...suggestionsDoc([{ description: "Find recommended extensions", cmd: "axm discover" }]),
      ];
    case "empty-user":
      return paragraphDoc("No extensions installed at user scope.");
  }
};

/**
 * `axm list` for a person: one table whose rows that need attention carry a
 * mark and a toned cell, and the summary sentence after it.
 */
export const listDoc = (options: {
  readonly items: ReadonlyArray<ExtensionListItem>;
  readonly filter: ExtensionListFilter;
  /** How much of the inventory a filtered listing could assess. */
  readonly coverage?: ExtensionListDocument["coverage"];
  readonly empty: Doc;
}): Doc => {
  const rows = options.items.map((item) => toRow(item, options.filter));
  const coverage = options.coverage;
  return inventoryDoc({
    rows,
    columns: ExtensionListColumns,
    summary:
      coverage === undefined
        ? inventorySentence(rows)
        : [
            count(rows.length, `${options.filter} extension`),
            `checked ${String(coverage.checked)}/${String(coverage.eligible)}`,
            `${String(coverage.unknown)} unknown`,
          ],
    mark: (row) => (needsAttention(row) ? "warn" : undefined),
    empty: options.empty,
  });
};
