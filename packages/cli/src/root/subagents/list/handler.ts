import * as Effect from "effect/Effect";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/extension-management/unstable/cli-renderer";
import {
  ExtensionInventorySchema,
  WorkspaceMutations,
  type ConfiguredAgentOutcome,
} from "@agentxm/workspace-state";
import {
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryState,
  inventorySummary,
  renderEmptyInventory,
  renderInventoryTable,
} from "../../extension-inventory.js";

export interface ListSubagentsHandlerArgs {
  readonly agents: readonly string[];
}

interface SubagentListItem {
  readonly name: string;
  readonly state: string;
  readonly activation: string;
  readonly agents: ReadonlyArray<string>;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
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
    agentOutcomes: { header: "Agent outcomes", render: inventoryAgentOutcomes },
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
    agents: args.agents,
  });
  const items = inventory.items.map((row) => ({
    name: row.name,
    state: inventoryState(row),
    activation: inventoryActivation(row),
    agents: row.agents,
    agentOutcomes: row.agentOutcomes,
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
