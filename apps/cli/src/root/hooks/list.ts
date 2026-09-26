import { listHooks } from "@agentxm/workspace/inspection";

import { sourcedListColumns } from "../inventory-view.js";
import { inventoryList, makePerTypeListCommand } from "../shared/list-command.js";

const { handler, command } = makePerTypeListCommand({
  type: "hook",
  ...inventoryList("hook", () => listHooks()),
  columns: sourcedListColumns,
  agentFilter: false,
});

export const handleList = handler;
export const listCommand = command;
