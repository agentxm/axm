import { listPacks, type PackListRow } from "@agentxm/workspace/inspection";
import { type ViewColumn } from "../../screen/index.js";
import { inventoryAgentOutcomes, inventoryLifecycle } from "../inventory-view.js";
import { inventoryList, makePerTypeListCommand } from "../shared/list-command.js";

const PackListColumns = [
  { header: "Name", priority: "required", value: (row: PackListRow) => row.name },
  { header: "State", value: (row: PackListRow) => inventoryLifecycle(row) },
  { header: "Owner", value: (row: PackListRow) => row.owner },
  { header: "Version", value: (row: PackListRow) => row.version },
  { header: "Source", value: (row: PackListRow) => row.source },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: PackListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<PackListRow>>;

const { handler, command } = makePerTypeListCommand({
  type: "pack",
  ...inventoryList("pack", () => listPacks()),
  columns: PackListColumns,
  agentFilter: false,
});

export const handleList = handler;
export const listCommand = command;
