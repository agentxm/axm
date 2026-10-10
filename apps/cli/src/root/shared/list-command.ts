import { withParameterDescription } from "../../cli-parameters.js";
/** Shared list command shell; each type supplies its own rows and document. */

import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
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
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";
import { inventorySummary } from "../inventory-view.js";
import { readOnlyCapabilities, withCommandCapabilities } from "./command-capabilities.js";

interface ListDefinition<Row, S extends Schema.Top, E extends ExpectedCliError, R> {
  readonly type: InstallableExtensionType;
  readonly query: (
    agents: ReadonlyArray<string>,
  ) => Effect.Effect<
    { readonly document: Schema.Schema.Type<S>; readonly rows: ReadonlyArray<Row> },
    E,
    R
  >;
  readonly schema: S;
  readonly columns: ReadonlyArray<ViewColumn<Row>>;
  readonly summary: (document: Schema.Schema.Type<S>, rows: ReadonlyArray<Row>) => string;
}

export const inventoryList = <Row, E, R>(
  type: InstallableExtensionType,
  list: (agents: ReadonlyArray<string>) => Effect.Effect<TypeListResult<Row>, E, R>,
) => ({
  query: (agents: ReadonlyArray<string>) =>
    Effect.map(list(agents), ({ document, rows }) => ({ document, rows })),
  schema: ExtensionInventoryDocumentSchema,
  summary: (inventory: ExtensionInventoryDocument) =>
    inventorySummary(inventory, EXTENSION_TYPE_PRESENTATION[type].noun.singular),
});

export const makePerTypeListCommand = <Row, S extends Schema.Top, E extends ExpectedCliError, R>(
  definition: ListDefinition<Row, S, E, R>,
) => {
  const { route, noun } = EXTENSION_TYPE_PRESENTATION[definition.type];
  const handler = Effect.fn(`${route}.list`)(function* (
    args: { readonly agents: ReadonlyArray<string> } = { agents: [] },
  ) {
    const { document, rows } = yield* withLiveOperation(
      { command: `${route}.list`, name: `Inspect ${noun.plural}`, mode: "query" },
      definition.query(args.agents),
    );
    yield* emitResult(document, definition.schema, () =>
      inventoryDoc({
        rows,
        columns: definition.columns,
        summary: definition.summary(document, rows),
        empty:
          args.agents.length > 0
            ? `No ${noun.plural} matched the selected agent filter.`
            : `No ${noun.plural} found`,
      }),
    );
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
      withRuntime(`${route} list`),
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
