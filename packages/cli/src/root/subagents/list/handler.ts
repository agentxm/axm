import * as Effect from "effect/Effect";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import {
  ExtensionInventorySchema,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import {
  inventoryActivation,
  inventoryIgnoredBy,
  inventoryState,
  inventorySummary,
  renderEmptyInventory,
  renderInventoryTable,
} from "../../extension-inventory.js";

export interface ListSubagentsHandlerArgs {
  readonly agents: readonly string[];
  readonly includeIgnored: boolean;
}

interface SubagentListItem {
  readonly name: string;
  readonly state: string;
  readonly activation: string;
  readonly agents: ReadonlyArray<string>;
  readonly ignoredBy: string;
}

const SubagentListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    activation: { header: "Activation" },
    agents: {
      header: "Agents",
      render: (value: ReadonlyArray<string>) =>
        value.length === 0 ? "all configured agents" : value.join(", "),
    },
    ignoredBy: { header: "Ignored by" },
  },
} as const satisfies TableView<SubagentListItem>;

registerEntity<SubagentListItem>("subagent", {
  list: {
    columns: SubagentListTable.columns,
    emptyMessage: "No subagents found",
    singularLabel: "subagent",
    pluralLabel: "subagents",
  },
});

export const handleListSubagents = Effect.fn("ListSubagents.handle")(function* (
  args: ListSubagentsHandlerArgs,
) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;

  const inventory = yield* ws.records.getExtensionInventory("subagent", {
    includeIgnored: args.includeIgnored,
    agents: args.agents,
  });
  const items = inventory.items.map((row) => ({
    name: row.name,
    state: inventoryState(row),
    activation: inventoryActivation(row),
    agents: row.agents,
    ignoredBy: inventoryIgnoredBy(row),
  }));

  if (yield* renderer.result(inventory, ExtensionInventorySchema)) return;
  if (items.length === 0) {
    yield* renderEmptyInventory(
      renderer,
      args.agents.length === 0
        ? "No subagents found"
        : "No subagents matched the selected agent filter.",
    );
    return;
  }

  yield* renderInventoryTable(
    renderer,
    items,
    SubagentListTable,
    inventorySummary(inventory, "subagent"),
  );
});
