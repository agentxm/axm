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
  PROSE_SEPARATOR,
  count,
  inventoryDoc,
  invocation,
  paragraphDoc,
  suggestionsDoc,
  type Doc,
  type Span,
  type Text,
  type ViewColumn,
} from "../../screen/index.js";
import { extensionTypeText } from "../inventory-view.js";

type ListItem = ExtensionListDocument["items"][number];

const itemRef = (item: ListItem) => item.fqn ?? `${extensionTypeToPlural[item.type]}/${item.name}`;

interface ListTableRow {
  readonly extension: string;
  readonly type: InstallableExtensionType;
  readonly management: ListItem["management"];
  readonly installed: boolean | null;
  readonly enabled: boolean | null;
  readonly version: string;
  readonly source: string;
  readonly state: ListItem["assessment"]["state"];
  readonly lifecycle: string;
  readonly guidance: string;
  readonly configuredAgents: string;
  readonly observedAgents: string;
}

/** What `axm lint` reports on: an installation desired state no longer reaches, or one that is missing. */
const lintExplains = (row: ListTableRow): boolean =>
  row.management === "leftover" || !row.installed;

const needsAttention = (row: ListTableRow): boolean =>
  lintExplains(row) || row.state === "deprecated" || row.state === "archived";

const attention = (value: string, flagged: boolean): Text =>
  flagged ? [{ text: value, tone: "warn" }] : value;

/** How desired state explains a row, in the word a table cell can carry. */
const managementWord = (management: ListItem["management"]): string => {
  switch (management) {
    case "configured":
      return "managed";
    case "implicit":
      return "from a pack";
    case "leftover":
      return "leftover";
    case "undeclared":
      return "not added";
    case "unmanaged":
      return "outside AXM";
  }
};

/**
 * One row's local state: how desired state explains it, then whatever departs
 * from an ordinary installed and enabled extension. What needs attention is
 * toned so it stands out in the row the gutter mark points at.
 */
const stateText = (row: ListTableRow): Text => {
  const warn = (text: string): Span => ({ text, tone: "warn" });
  const parts: ReadonlyArray<Span> = [
    row.management === "leftover" ? warn("leftover") : { text: managementWord(row.management) },
    ...(row.installed === false ? [warn("missing")] : []),
    ...(row.installed === null ? [warn("install unknown")] : []),
    ...(row.enabled === false ? [{ text: "disabled" }] : []),
  ];
  return parts.flatMap((part, index) => (index === 0 ? [part] : [{ text: PROSE_SEPARATOR }, part]));
};

/** The agents a column lists, stated once when every row lists the same ones. */
const agentsFact =
  (verb: string, emptyFact: string | undefined) =>
  (agents: string): Text | undefined =>
    agents === ABSENT ? emptyFact : `${verb} ${agents}`;

const ExtensionListColumns = [
  {
    header: "Extension",
    role: "name",
    priority: "required",
    value: (row: ListTableRow) => row.extension,
  },
  { header: "Type", value: (row: ListTableRow) => extensionTypeText(row.type) },
  { header: "State", value: stateText },
  { header: "Version", value: (row: ListTableRow) => row.version },
  { header: "Source", priority: "optional", value: (row: ListTableRow) => row.source },
  {
    header: "Configured agents",
    priority: "optional",
    value: (row: ListTableRow) => row.configuredAgents,
    whenUniform: (row: ListTableRow) =>
      agentsFact("configured for", "no agents configured")(row.configuredAgents),
  },
  {
    header: "Observed agents",
    priority: "optional",
    value: (row: ListTableRow) => row.observedAgents,
    // Observing nothing is the ordinary case, so it goes unsaid.
    whenUniform: (row: ListTableRow) => agentsFact("observed in", undefined)(row.observedAgents),
  },
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
  if (item.assessment.state === "unknown")
    return item.assessment.reason ?? "Assessment evidence is unavailable";
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

/** A registry locator's leading source name, as in `company:@acme/skills/review@^1.0.0`. */
const REGISTRY_SOURCE_NAME = /^([A-Za-z0-9][\w.-]*):(?!\/\/)/u;

/**
 * Where a row comes from, as short as tells sources apart: the Extension
 * column already names a registry extension, so its source names only the
 * registry it was acquired through.
 */
const sourceText = (source: ListItem["source"]): string => {
  switch (source.kind) {
    case "registry":
      return REGISTRY_SOURCE_NAME.exec(source.locator)?.[1] ?? source.kind;
    case "git":
    case "http":
    case "path":
      return source.locator;
    case "workspace":
    case "bundled":
    case "inline":
    case "unmanaged":
    case "unknown":
      return source.kind;
  }
};

const toRow = (item: ListItem): ListTableRow => ({
  extension: itemRef(item),
  type: item.type,
  management: item.management,
  installed: item.installed,
  enabled: item.enabled,
  version: item.version ?? ABSENT,
  source: sourceText(item.source),
  state: item.assessment.state,
  lifecycle: [
    ...(item.assessment.deprecation === undefined ? [] : ["deprecated"]),
    ...(item.assessment.archival === undefined ? [] : ["archived"]),
  ].join(", "),
  guidance: guidanceFor(item),
  configuredAgents: item.agents.configured.join(", ") || ABSENT,
  observedAgents: item.agents.observed.join(", ") || ABSENT,
});

/** The inventory's closing facts: how many, and how many are enabled. */
const inventorySentence = (rows: ReadonlyArray<ListTableRow>): ReadonlyArray<Text> => [
  count(rows.length, "extension"),
  `${String(rows.filter((row) => row.enabled === true).length)} enabled`,
];

/**
 * When a row is flagged, how many need attention, and the command that
 * explains the local ones.
 */
const attentionSentence = (rows: ReadonlyArray<ListTableRow>): ReadonlyArray<Text> => {
  const flagged = rows.filter(needsAttention).length;
  return [
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
      ? [[{ text: "run " }, ...invocation("axm lint")] satisfies Text]
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
    columns:
      options.filter === "all"
        ? ExtensionListColumns.filter(
            (column) => column.header !== "Assessment" && column.header !== "Guidance",
          )
        : ExtensionListColumns,
    ...(coverage === undefined ? { summaryTail: attentionSentence(rows) } : {}),
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
