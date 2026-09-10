import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../../screen/index.js";
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
} from "../../inventory-view.js";

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

const SubagentListColumns = [
  { header: "Name", priority: "required", value: (row: SubagentListItem) => row.name },
  { header: "State", value: (row: SubagentListItem) => row.state },
  { header: "Activation", value: (row: SubagentListItem) => row.activation },
  {
    header: "Agents",
    value: (row: SubagentListItem) =>
      row.agents.length === 0 ? "all configured agents" : row.agents.join(", "),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: SubagentListItem) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<SubagentListItem>>;

export const handleListSubagents = Effect.fn("ListSubagents.handle")(function* (
  args: ListSubagentsHandlerArgs,
) {
  const screen = yield* Screen;
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

  if (yield* screen.document(inventory, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows: items,
      columns: SubagentListColumns,
      summary: inventorySummary(inventory, "subagent"),
      empty:
        args.agents.length === 0
          ? "No subagents found"
          : "No subagents matched the selected agent filter.",
    }),
  );
});
