import { listSubagents, type TypeListRow } from "@agentxm/workspace/inspection";
import { type ViewColumn } from "../../screen/index.js";
import {
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryLifecycle,
} from "../inventory-view.js";
import { inventoryList, makePerTypeListCommand } from "../shared/list-command.js";

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

const { handler, command } = makePerTypeListCommand({
  type: "subagent",
  ...inventoryList("subagent", (agents) => listSubagents({ agents })),
  columns: SubagentListColumns,
  agentFilter: true,
});

export const handleList = handler;
export const listCommand = command;
