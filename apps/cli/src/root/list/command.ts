import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "../../app-error/index.js";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { observeUnit } from "@agentxm/workspace-operations";
import { withLiveOperation } from "../shared/operation-lifecycle.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  ExtensionListDocumentSchema,
  ListExtensions,
  type ExtensionListDocument,
} from "@agentxm/workspace-inspection";
import type { ExtensionListItem } from "@agentxm/workspace-inspection";

import { inspectionFailureToAppError } from "../../feature-errors.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

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
  { header: "Extension", priority: "required", value: (row: ListTableRow) => row.extension },
  { header: "Type", value: (row: ListTableRow) => row.type },
  { header: "Management", value: (row: ListTableRow) => row.management },
  { header: "Installed", value: (row: ListTableRow) => row.installed },
  { header: "Version", value: (row: ListTableRow) => row.version },
  { header: "Source", priority: "optional", value: (row: ListTableRow) => row.source },
  { header: "Assessment", value: (row: ListTableRow) => row.state },
  { header: "Guidance", priority: "optional", value: (row: ListTableRow) => row.guidance },
] satisfies ReadonlyArray<ViewColumn<ListTableRow>>;

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
  const filter = args.outdated ? "outdated" : args.deprecated ? "deprecated" : "all";
  const result = yield* withLiveOperation(
    { command: "list", name: "List extensions", mode: "preview" },
    observeUnit(
      { id: "assessment", label: `${filter === "outdated" ? "update" : "deprecation"} status` },
      ListExtensions.query({
        ...(Option.isSome(args.type) ? { type: args.type.value } : {}),
        filter,
      }).pipe(Effect.mapError(inspectionFailureToAppError)),
    ),
  );
  const document: ExtensionListDocument = result.document;
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
  const tableRows = result.items.map((item): ListTableRow => ({
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
  const count = document.count;
  const summary =
    coverage === undefined
      ? `${count} extension${count === 1 ? "" : "s"}`
      : `${count} ${filter} extension${count === 1 ? "" : "s"}; checked ${coverage.checked}/${coverage.eligible}, ${coverage.unknown} unknown`;
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
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List extensions across all types"),
  Command.withExamples([
    { command: "axm list", description: "List the local project inventory" },
    { command: "axm list --type skill", description: "List only skills" },
    { command: "axm list --outdated", description: "Check installed extensions for updates" },
    { command: "axm list --deprecated", description: "Check for deprecated extensions" },
    { command: "axm list --scope user", description: "List user-level extensions" },
  ]),
);
