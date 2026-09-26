import * as Effect from "effect/Effect";
import {
  listMcpServers,
  mcpServerListDocument,
  McpServerListQueryResultSchema,
  type McpServerListRow,
} from "@agentxm/workspace/inspection";
import { type ViewColumn } from "../../screen/index.js";
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";
import { inventoryAgentOutcomes, inventoryLifecycle, inventorySummary } from "../inventory-view.js";
import { makePerTypeListCommand } from "../shared/list-command.js";

const McpServerListColumns = [
  { header: "Local name", priority: "required", value: (row: McpServerListRow) => row.localName },
  { header: "Source", value: (row: McpServerListRow) => row.source },
  { header: "State", value: (row: McpServerListRow) => inventoryLifecycle(row) },
  { header: "Version", priority: "optional", value: (row: McpServerListRow) => row.version },
  { header: "Transport", value: (row: McpServerListRow) => row.transport },
  { header: "Status", value: (row: McpServerListRow) => row.status },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: McpServerListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<McpServerListRow>>;

const { handler, command } = makePerTypeListCommand({
  type: "mcp-server",
  query: () =>
    Effect.map(listMcpServers(), ({ inventory, rows }) => ({
      document: mcpServerListDocument({ inventory, rows }),
      rows,
    })),
  schema: McpServerListQueryResultSchema,
  columns: McpServerListColumns,
  summary: (document) =>
    inventorySummary(document, EXTENSION_TYPE_PRESENTATION["mcp-server"].noun.singular),
  agentFilter: false,
});

export const handleList = handler;
export const listCommand = command;
