import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type {
  ExtensionListDocument,
  ExtensionListFilter,
} from "@agentxm/workspace-features/inspection";
import { formatDeprecationWarning } from "@agentxm/registry-client";
import * as DateTime from "effect/DateTime";

import {
  ABSENT,
  count,
  inventoryDoc,
  paragraphDoc,
  suggestionsDoc,
  type Doc,
  type Text,
  type ViewColumn,
} from "../../screen/index.js";
import { extensionTypeText, inventoryLifecycle } from "../inventory-view.js";

type ListItem = ExtensionListDocument["items"][number];

const itemRef = (item: ListItem) => item.fqn ?? `${extensionTypeToPlural[item.type]}/${item.name}`;
const nativeInspection = (item: ListItem) =>
  "agentOutcomes" in item.inspection ? item.inspection : undefined;

interface ListTableRow {
  readonly extension: string;
  readonly type: InstallableExtensionType;
  readonly management: ListItem["management"];
  readonly installed: boolean | null;
  readonly enabled: boolean;
  readonly version: string;
  readonly source: string;
  readonly state: ListItem["assessment"]["state"];
  readonly lifecycle: string;
  readonly guidance: string;
  readonly configuredAgents: string;
  readonly observedAgents: string;
  readonly inspectionState: string;
  readonly nativeLocations: string;
  readonly configuredConsumers: string;
  readonly discovery: string;
}

/** What `axm lint` reports on: an installation desired state no longer reaches, or one that is missing. */
const lintExplains = (row: ListTableRow): boolean =>
  row.management === "leftover" || !row.installed;

const needsAttention = (row: ListTableRow): boolean =>
  lintExplains(row) || row.state === "deprecated" || row.state === "archived";

const attention = (value: string, flagged: boolean): Text =>
  flagged ? [{ text: value, tone: "warn" }] : value;

const ExtensionListColumns = [
  { header: "Extension", priority: "required", value: (row: ListTableRow) => row.extension },
  { header: "Type", value: (row: ListTableRow) => extensionTypeText(row.type) },
  {
    header: "Management",
    value: (row: ListTableRow) =>
      attention(inventoryLifecycle({ lifecycle: row.management }), row.management === "leftover"),
  },
  {
    header: "Installed",
    value: (row: ListTableRow) =>
      attention(
        row.installed === null ? "unknown" : row.installed ? "yes" : "missing",
        !row.installed,
      ),
  },
  {
    header: "Configured agents",
    priority: "optional",
    value: (row: ListTableRow) => row.configuredAgents,
  },
  {
    header: "Observed agents",
    priority: "optional",
    value: (row: ListTableRow) => row.observedAgents,
  },
  { header: "Inspection", value: (row: ListTableRow) => row.inspectionState },
  { header: "Native locations", value: (row: ListTableRow) => row.nativeLocations },
  { header: "Configured consumers", value: (row: ListTableRow) => row.configuredConsumers },
  { header: "Discovery", value: (row: ListTableRow) => row.discovery },
  { header: "Version", value: (row: ListTableRow) => row.version },
  { header: "Source", priority: "optional", value: (row: ListTableRow) => row.source },
  {
    header: "Assessment",
    value: (row: ListTableRow) =>
      attention(
        row.state === "not-checked"
          ? "not checked"
          : row.state === "not-applicable"
            ? "not applicable"
            : row.state === "available"
              ? "update available"
              : row.state === "changed"
                ? "source changed"
                : row.lifecycle || row.state,
        row.state === "deprecated" || row.state === "archived",
      ),
  },
  { header: "Guidance", priority: "optional", value: (row: ListTableRow) => row.guidance },
] satisfies ReadonlyArray<ViewColumn<ListTableRow>>;

const guidanceFor = (item: ListItem): string => {
  const deprecation = item.assessment.deprecation;
  const archival = item.assessment.archival;
  return (
    [
      ...(archival === undefined
        ? []
        : [
            `Archived on ${DateTime.formatIso(archival.archivedAt)}${archival.message === undefined ? "" : `: ${archival.message}`}`,
          ]),
      ...(deprecation === undefined ? [] : [formatDeprecationWarning(itemRef(item), deprecation)]),
    ].join("; ") || ABSENT
  );
};

const toRow = (item: ListItem): ListTableRow => ({
  extension: itemRef(item),
  type: item.type,
  management: item.management,
  installed: item.installed,
  enabled: item.enabled === true,
  version: item.version ?? ABSENT,
  source: "locator" in item.source ? (item.source.locator ?? item.source.kind) : item.source.kind,
  state: item.assessment.state,
  lifecycle: [
    ...(item.assessment.deprecation === undefined ? [] : ["deprecated"]),
    ...(item.assessment.archival === undefined ? [] : ["archived"]),
  ].join(", "),
  guidance: guidanceFor(item),
  configuredAgents: item.agents.configured.join(", ") || ABSENT,
  observedAgents: item.agents.observed.join(", ") || ABSENT,
  inspectionState: item.inspection.state,
  nativeLocations:
    nativeInspection(item)
      ?.nativeLocations?.map(
        (unit) =>
          `${unit.address.path}: ${unit.state}${unit.policyReasons.length === 0 ? "" : ` (${unit.policyReasons.join(", ")})`}`,
      )
      .join("; ") || ABSENT,
  configuredConsumers:
    [
      ...new Set(
        nativeInspection(item)?.nativeLocations?.flatMap((unit) => unit.configuredConsumers) ?? [],
      ),
    ].join(", ") || ABSENT,
  discovery:
    nativeInspection(item)
      ?.duplicateDiscoveries?.map(
        (duplicate) =>
          `${duplicate.agentId}: ${String(duplicate.nativeUnits.length)} locations; runtime selection unverified`,
      )
      .join("; ") || ABSENT,
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
export type EmptyInventory = "no-workspace" | "empty-project" | "empty-user";

/** An empty inventory says what is true, then the one command that moves on. */
export const emptyInventoryDoc = (state: EmptyInventory): Doc => {
  switch (state) {
    case "no-workspace":
      return [
        ...paragraphDoc("No AXM workspace in this project."),
        ...suggestionsDoc([
          {
            description: "Set up AXM in this project",
            invocation: { command: ["setup"], arguments: [] },
          },
        ]),
      ];
    case "empty-project":
      return [
        ...paragraphDoc("No extensions installed in this project."),
        ...suggestionsDoc([{ description: "Find recommended extensions", cmd: "axm discover" }]),
      ];
    case "empty-user":
      return paragraphDoc("No extensions installed for this user.");
  }
};

/** A filtered empty state distinguishes no matches from incomplete assessment. */
const emptyFilteredInventoryDoc = (
  filter: Exclude<ExtensionListFilter, "all">,
  coverage: ExtensionListDocument["coverage"] | undefined,
): Doc =>
  paragraphDoc(
    `No ${filter === "lifecycle" ? "deprecated or archived" : filter} extensions found${coverage !== undefined && coverage.unknown > 0 ? `; ${String(coverage.unknown)} could not be assessed` : ""}`,
  );

/**
 * `axm list` for a person: one table whose rows that need attention carry a
 * mark and a toned cell, and the summary sentence after it.
 */
export const listDoc = (options: {
  readonly items: ReadonlyArray<ListItem>;
  readonly filter: ExtensionListFilter;
  readonly details?: boolean;
  /** How much of the inventory a filtered listing could assess. */
  readonly coverage?: ExtensionListDocument["coverage"];
  readonly emptyState?: EmptyInventory;
}): Doc => {
  const rows = options.items.map(toRow);
  const coverage = options.coverage;
  const empty =
    options.filter === "all"
      ? emptyInventoryDoc(options.emptyState ?? "empty-project")
      : emptyFilteredInventoryDoc(options.filter, coverage);
  return inventoryDoc({
    rows,
    columns: (options.filter === "all"
      ? ExtensionListColumns.filter(
          (column) => column.header !== "Assessment" && column.header !== "Guidance",
        )
      : ExtensionListColumns
    ).filter(
      (column) =>
        options.details === true ||
        !["Inspection", "Native locations", "Configured consumers", "Discovery"].includes(
          column.header,
        ),
    ),
    summary:
      coverage === undefined
        ? inventorySentence(rows)
        : [
            count(
              rows.length,
              `${options.filter === "lifecycle" ? "deprecated or archived" : options.filter} extension`,
            ),
            `checked ${String(coverage.checked)}/${String(coverage.eligible)}`,
            `${String(coverage.unknown)} unknown`,
          ],
    mark: (row) => (needsAttention(row) ? "warn" : undefined),
    empty,
  });
};
