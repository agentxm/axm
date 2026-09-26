import { listRules } from "@agentxm/workspace/inspection";

import { sourcedListColumns } from "../inventory-view.js";
import { inventoryList, makePerTypeListCommand } from "../shared/list-command.js";

const { handler, command } = makePerTypeListCommand({
  type: "rule",
  ...inventoryList("rule", () => listRules()),
  columns: sourcedListColumns,
  agentFilter: false,
});

export const handleList = handler;
export const listCommand = command;
