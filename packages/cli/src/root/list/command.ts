import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "../../app-error/index.js";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  assessExtensionListItems,
  collectExtensionListItems,
  type ExtensionListFilter,
  type ExtensionListItem,
} from "@agentxm/workspace-inspection";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";

import { inspectionFailureToAppError } from "../../feature-errors.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

const ListFilterSchema = Schema.Literals(["all", "outdated", "deprecated"] as const);
type ListFilter = typeof ListFilterSchema.Type;

const AssessmentStateSchema = Schema.Literals([
  "not-checked",
  "current",
  "available",
  "changed",
  "active",
  "deprecated",
  "unknown",
  "not-applicable",
] as const);

const ExtensionAssessmentSchema = Schema.Struct({
  state: AssessmentStateSchema,
  reason: Schema.optional(Schema.String),
  installedVersion: Schema.optional(Schema.String),
  constraint: Schema.optional(Schema.String),
  latestMatching: Schema.optional(Schema.String),
  latestAvailable: Schema.optional(Schema.String),
  installedRevision: Schema.optional(Schema.String),
  currentRevision: Schema.optional(Schema.String),
  deprecation: Schema.optional(DeprecationViewSchema),
});

const ExtensionListItemSchema = Schema.Struct({
  ref: Schema.String,
  type: ExtensionTypeSchema,
  name: Schema.String,
  management: Schema.Literals(["configured", "implicit", "unmanaged"] as const),
  installed: Schema.Boolean,
  enabled: Schema.NullOr(Schema.Boolean),
  version: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String),
  sourceName: Schema.optional(Schema.String),
  assessment: ExtensionAssessmentSchema,
});

const CoverageSchema = Schema.Struct({
  eligible: Schema.Number,
  checked: Schema.Number,
  unknown: Schema.Number,
  notApplicable: Schema.Number,
});

export const ExtensionListDocumentSchema = Schema.Struct({
  filter: ListFilterSchema,
  items: Schema.Array(ExtensionListItemSchema),
  count: Schema.Number,
  totalCount: Schema.Number,
  coverage: Schema.optional(CoverageSchema),
});
export type ExtensionListDocument = typeof ExtensionListDocumentSchema.Type;

interface ListTableRow {
  readonly extension: string;
  readonly type: string;
  readonly management: string;
  readonly installed: string;
  readonly version: string;
  readonly source: string;
  readonly state: string;
  readonly guidance: string;
}

const ExtensionListColumns = [
  { header: "Extension", value: (row: ListTableRow) => row.extension },
  { header: "Type", value: (row: ListTableRow) => row.type },
  { header: "Management", value: (row: ListTableRow) => row.management },
  { header: "Installed", value: (row: ListTableRow) => row.installed },
  { header: "Version", value: (row: ListTableRow) => row.version },
  { header: "Source", value: (row: ListTableRow) => row.source },
  { header: "Assessment", value: (row: ListTableRow) => row.state },
  { header: "Guidance", value: (row: ListTableRow) => row.guidance },
] satisfies ReadonlyArray<ViewColumn<ListTableRow>>;

const matchesFilter = (item: ExtensionListItem, filter: ListFilter): boolean =>
  filter === "all" ||
  (filter === "outdated"
    ? item.assessment.state === "available" || item.assessment.state === "changed"
    : item.assessment.state === "deprecated");

const coverageFor = (items: ReadonlyArray<ExtensionListItem>) => ({
  eligible: items.filter((item) => item.installed).length,
  checked: items.filter((item) =>
    ["current", "available", "changed", "active", "deprecated"].includes(item.assessment.state),
  ).length,
  unknown: items.filter((item) => item.assessment.state === "unknown").length,
  notApplicable: items.filter((item) => item.assessment.state === "not-applicable").length,
});

const summarizeLifecycle = (item: ExtensionListItem): ExtensionListItem => {
  const { deprecation: _deprecation, ...assessment } = item.assessment;
  return { ...item, assessment };
};

export interface ListHandlerArgs {
  readonly type: Option.Option<InstallableExtensionType>;
  readonly outdated: boolean;
  readonly deprecated: boolean;
}

export const handleList = Effect.fn("List.handle")(function* (args: ListHandlerArgs) {
  if (args.outdated && args.deprecated) {
    return yield* makeAppError({
      code: "usage",
      detail: "--outdated and --deprecated cannot be combined",
    });
  }
  const screen = yield* Screen;
  const localItems = yield* collectExtensionListItems(Option.getOrUndefined(args.type)).pipe(
    Effect.mapError(inspectionFailureToAppError),
  );
  const filter: ExtensionListFilter = args.outdated
    ? "outdated"
    : args.deprecated
      ? "deprecated"
      : "all";
  const assessmentFilter = filter === "outdated" ? "outdated" : "deprecated";
  const assessed = yield* screen.task(
    `Checking extensions for ${assessmentFilter === "outdated" ? "updates" : "deprecation"}`,
    () =>
      Effect.scoped(assessExtensionListItems(localItems, assessmentFilter)).pipe(
        Effect.mapError(inspectionFailureToAppError),
      ),
    { successMessage: `Checked extension ${assessmentFilter} status` },
  );
  const items = assessed
    .filter((item) => matchesFilter(item, filter))
    .map((item) => (filter === "all" ? summarizeLifecycle(item) : item));
  const document: ExtensionListDocument = {
    filter,
    items,
    count: items.length,
    totalCount: localItems.length,
    ...(filter === "all" ? {} : { coverage: coverageFor(assessed) }),
  };
  if (yield* screen.document(document, ExtensionListDocumentSchema)) return;
  const guidanceFor = (item: ExtensionListItem): string => {
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
  const tableRows = items.map((item): ListTableRow => ({
    extension: item.ref,
    type: item.type,
    management: item.management,
    installed: item.installed ? "yes" : "missing",
    version: item.version ?? "-",
    source: item.sourceName ?? item.source ?? "-",
    state: item.assessment.state,
    guidance: guidanceFor(item),
  }));
  const coverage = document.coverage;
  const summary =
    coverage === undefined
      ? `${items.length} extension${items.length === 1 ? "" : "s"}`
      : `${items.length} ${filter} extension${items.length === 1 ? "" : "s"}; checked ${coverage.checked}/${coverage.eligible}, ${coverage.unknown} unknown`;
  yield* screen.result(
    inventoryDoc({
      rows: tableRows,
      columns: ExtensionListColumns,
      summary,
      empty:
        filter === "all"
          ? "No extensions found"
          : `No ${filter} extensions found${coverage !== undefined && coverage.unknown > 0 ? `; ${coverage.unknown} could not be assessed` : ""}`,
    }),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("List project (default) or user-level extensions")),
  type: Flag.choice("type", [...installableExtensionTypes]).pipe(
    Flag.withDescription("Only list a specific extension type"),
    Flag.optional,
  ),
  outdated: Flag.boolean("outdated").pipe(
    Flag.withDescription("Only list installed extensions with available updates"),
    Flag.withDefault(false),
  ),
  deprecated: Flag.boolean("deprecated").pipe(
    Flag.withDescription("Only list installed extensions deprecated by their registry"),
    Flag.withDefault(false),
  ),
} as const;

export const listCommand = Command.make(
  "list",
  listConfig,
  ({ scope, type, outdated, deprecated }) =>
    handleList({ type, outdated, deprecated }).pipe(
      withWorkspace({ scope, allowUninitialized: true }),
      withRuntime("list"),
    ),
).pipe(
  withArgvTracking(listConfig),
  Command.withDescription("List extensions across all types"),
  Command.withExamples([
    { command: "axm list", description: "List the local project inventory" },
    { command: "axm list --type skill", description: "List only skills" },
    { command: "axm list --outdated", description: "Check installed extensions for updates" },
    { command: "axm list --deprecated", description: "Check for deprecated extensions" },
    { command: "axm list --scope user", description: "List user-level extensions" },
  ]),
);
