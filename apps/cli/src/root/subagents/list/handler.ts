import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../../screen/index.js";
import { ExtensionInventorySchema } from "@agentxm/workspace-state";
import { listSubagents, type TypeListRow } from "@agentxm/workspace-inspection";
import {
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryLifecycle,
  inventorySummary,
} from "../../inventory-view.js";

export interface ListSubagentsHandlerArgs {
  readonly agents: readonly string[];
}

const SubagentListColumns = [
  { header: "Name", priority: "required", value: (row: TypeListRow) => row.name },
  { header: "State", value: (row: TypeListRow) => inventoryLifecycle(row) },
  { header: "Activation", value: (row: TypeListRow) => inventoryActivation(row) },
  {
    header: "Agents",
    value: (row: TypeListRow) =>
      row.agents.length === 0 ? "all configured agents" : row.agents.join(", "),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: TypeListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<TypeListRow>>;

export const handleListSubagents = Effect.fn("ListSubagents.handle")(function* (
  args: ListSubagentsHandlerArgs,
) {
  const screen = yield* Screen;
  const { inventory, rows } = yield* listSubagents({ agents: args.agents });
  if (yield* screen.document(inventory, ExtensionInventorySchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows,
      columns: SubagentListColumns,
      summary: inventorySummary(inventory, "subagent"),
      empty:
        args.agents.length === 0
          ? "No subagents found"
          : "No subagents matched the selected agent filter.",
    }),
  );
});
