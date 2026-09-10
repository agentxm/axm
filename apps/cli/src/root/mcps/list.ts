import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import {
  listMcpServers,
  mcpServerListDocument,
  McpServerListQueryResultSchema,
  type McpServerListRow,
} from "@agentxm/workspace-inspection";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { inventoryAgentOutcomes, inventoryLifecycle, inventorySummary } from "../inventory-view.js";

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

export const handleListMcpServers = Effect.fn("ListMcpServers.handle")(function* () {
  const screen = yield* Screen;
  const { inventory, rows } = yield* listMcpServers();
  const output = mcpServerListDocument({ inventory, rows });
  if (yield* screen.document(output, McpServerListQueryResultSchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows,
      columns: McpServerListColumns,
      summary: inventorySummary(inventory, "MCP server"),
      empty: "No MCP servers found",
    }),
  );
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List MCP servers from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListMcpServers().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("mcps list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List detected MCP servers and their lifecycle classification"),
  Command.withExamples([
    { command: "axm mcps list", description: "Inventory detected MCP servers" },
    {
      command: "axm mcps list --scope user",
      description: "Check user-level MCP servers",
    },
  ]),
);
