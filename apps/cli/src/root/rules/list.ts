import { listRules } from "@agentxm/workspace-features/inspection";

import { sourcedListColumns } from "../inventory-view.js";
import { inventoryList, makePerTypeListCommand } from "../shared/list-command.js";

const { handler, command } = makePerTypeListCommand({
  type: "rule",
  ...inventoryList("rule", (agents) => listRules({ agents })),
  columns: sourcedListColumns,
});

export const handleList = handler;
export const listCommand = command;
