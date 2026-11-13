import { withParameterDescription } from "../../cli-parameters.js";
/** Shared list command shell; each type supplies its own rows and document. */

import * as Effect from "effect/Effect";
import { Command } from "effect/cli";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  ExtensionInventoryDocumentSchema,
  type ExtensionInventoryDocument,
} from "@agentxm/workspace-features/inspection";
import type { TypeListResult } from "@agentxm/workspace-features/inspection";

import { agentFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking, type ExpectedCliError } from "../../cli-runtime/index.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitResult, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { extensionTypePresentation } from "../extension-type-presentation.js";
import { inventorySummary, inventoryDiagnosticsDoc } from "../inventory-view.js";
import { readOnlyCapabilities, withCommandCapabilities } from "./command-capabilities.js";

const detailColumnHeaders = [
  "Native locations",
  "Discovery",
  "Agent outcomes",
  "Concepts",
  "Diagnostics",
];

interface InventoryListRow {
  readonly installed: boolean | null;
  readonly configuredAgents?: ReadonlyArray<string>;
  readonly observedAgents?: ReadonlyArray<string>;
  readonly inspectionState?: string;
}
interface ListDefinition<Row extends InventoryListRow, E extends ExpectedCliError, R> {
  readonly type: InstallableExtensionType;
  readonly query: (
    agents: ReadonlyArray<string>,
  ) => Effect.Effect<
    { readonly document: ExtensionInventoryDocument; readonly rows: ReadonlyArray<Row> },
    E,
    R
  >;
  readonly schema: typeof ExtensionInventoryDocumentSchema;
  readonly columns: ReadonlyArray<ViewColumn<Row>>;
  readonly summary: (document: ExtensionInventoryDocument, rows: ReadonlyArray<Row>) => string;
}

export const inventoryList = <Row, E, R>(
  type: InstallableExtensionType,
  list: (agents: ReadonlyArray<string>) => Effect.Effect<TypeListResult<Row>, E, R>,
) => ({
  query: (agents: ReadonlyArray<string>) =>
    Effect.map(list(agents), ({ document, rows }) => ({ document, rows })),
  schema: ExtensionInventoryDocumentSchema,
  summary: (inventory: ExtensionInventoryDocument) =>
    inventorySummary(inventory, extensionTypePresentation(type).noun.singular),
});

export const makePerTypeListCommand = <Row extends InventoryListRow, E extends ExpectedCliError, R>(
  definition: ListDefinition<Row, E, R>,
) => {
  const { route, noun } = extensionTypePresentation(definition.type);
  const handler = Effect.fn(`${route}.list`)(function* (
    args: { readonly agents: ReadonlyArray<string> } = { agents: [] },
  ) {
    const { document, rows } = yield* withLiveOperation(
      { name: `Inspect ${noun.plural}`, mode: "query" },
      definition.query(args.agents),
    );
    const common: ReadonlyArray<ViewColumn<Row>> = [
      {
        header: "Installed",
        value: (row) => (row.installed === null ? "unknown" : row.installed ? "yes" : "missing"),
      },
      {
        header: "Configured agents",
        priority: "optional",
        value: (row) => row.configuredAgents?.join(", ") || "none",
      },
      {
        header: "Observed agents",
        priority: "optional",
        value: (row) => row.observedAgents?.join(", ") || "none",
      },
    ];
    yield* emitResult(document, definition.schema, () => [
      ...inventoryDoc({
        rows,
        columns: [
          ...definition.columns,
          ...common.filter(
            (column) => !definition.columns.some((existing) => existing.header === column.header),
          ),
        ].filter(
          (column) =>
            typeof column.header !== "string" || !detailColumnHeaders.includes(column.header),
        ),
        summary: definition.summary(document, rows),
        empty:
          args.agents.length > 0
            ? `No ${noun.plural} matched the selected agent filter.`
            : `No ${noun.plural} found`,
      }),
      ...inventoryDiagnosticsDoc(document),
    ]);
  });
  const scope = scopeFlag;
  const description = `List detected ${noun.plural} and how AXM manages them`;
  const examples = [
    { command: `axm ${route} list`, description: `Inventory detected ${noun.plural}` },
    { command: `axm ${route} list --scope user`, description: `Check user-level ${noun.plural}` },
  ];

  const config = {
    scope,
    agent: agentFlag.pipe(
      withParameterDescription(
        `Show only ${noun.plural} observed by or configured for any of these coding agents`,
      ),
    ),
  } as const;
  const command = Command.make("list", config, ({ scope, agent }) =>
    handler({ agents: agent }).pipe(
      withWorkspace({ scope, allowUninitialized: true }),
      withRuntime(),
    ),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(readOnlyCapabilities()),
    Command.withDescription(description),
    Command.withExamples([
      ...examples,
      {
        command: `axm ${route} list --agent claude-code`,
        description: `See ${noun.plural} for a specific agent`,
      },
    ]),
  );
  return { handler, command };
};
