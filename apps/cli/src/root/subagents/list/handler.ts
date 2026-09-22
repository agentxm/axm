import { withLiveOperation } from "../../../operation-lifecycle.js";
import * as Effect from "effect/Effect";
import { emitResult, inventoryDoc, type ViewColumn } from "../../../screen/index.js";
import { ExtensionInventorySchema } from "@agentxm/workspace/desired-state";
import { listSubagents, type TypeListRow } from "@agentxm/workspace/inspection";
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
  const { inventory, rows } = yield* withLiveOperation(
    { command: "subagents.list", name: "Inspect subagents", mode: "preview" },
    listSubagents({ agents: args.agents }),
  );
  yield* emitResult(inventory, ExtensionInventorySchema, () =>
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
