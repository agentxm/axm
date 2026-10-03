import { listHooks, type SourcedListRow } from "@agentxm/workspace-features/inspection";

import { sourcedListColumns } from "../inventory-view.js";
import { inventoryList, makePerTypeListCommand } from "../shared/list-command.js";

const { handler, command } = makePerTypeListCommand({
  type: "hook",
  ...inventoryList("hook", () => listHooks()),
  columns: [
    ...sourcedListColumns,
    {
      header: "Native implementation",
      value: (row: SourcedListRow) =>
        row.agentOutcomes
          .map(
            (outcome) => `${outcome.agentId}: ${outcome.hook?.implementationId ?? outcome.reason}`,
          )
          .join("; ") || "not evaluated",
    },
    {
      header: "Verification",
      value: (row: SourcedListRow) =>
        row.agentOutcomes
          .map(
            (outcome) =>
              `${outcome.agentId}: fixtures ${outcome.hook?.fixtureEvidence.state ?? "not evaluated"}; native invocation ${outcome.hook?.nativeInvocation ?? "not observed"}`,
          )
          .join("; ") || "not evaluated",
    },
  ],
  agentFilter: false,
});

export const handleList = handler;
export const listCommand = command;
