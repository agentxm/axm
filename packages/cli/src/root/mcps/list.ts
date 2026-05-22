import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

interface McpServerListItem {
  readonly name: string;
  readonly version: string;
  readonly transport: string;
  readonly status: string;
}

const McpServerListTable = {
  columns: {
    name: { header: "Name" },
    version: { header: "Version" },
    transport: { header: "Transport" },
    status: { header: "Status" },
  },
} as const satisfies TableView<McpServerListItem>;

registerEntity<McpServerListItem>("mcp-server", {
  list: {
    columns: McpServerListTable.columns,
    emptyMessage: "No MCP servers installed",
  },
});

export const handleListMcpServers = Effect.fn("ListMcpServers.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const installed = yield* ws.records.getInstalledMcpServers();
  const unmanaged = yield* ws.records.getUnmanagedMcpServers();

  const installedItems = yield* Effect.forEach(
    Object.entries(installed),
    ([name, entry]) =>
      ws.getLockedMcpServer(name).pipe(
        Effect.map((locked) => ({
          name,
          version:
            Option.isSome(locked) && locked.value.type === "registry"
              ? locked.value.resolvedVersion
              : "n/a",
          transport: "auto",
          status: entry.lifecycle === "configured" && !entry.enabled ? "disabled" : "enabled",
        })),
      ),
    { concurrency: "unbounded" },
  );
  const unmanagedItems = Object.entries(unmanaged).map(([name, entry]) => ({
    name,
    version: "n/a",
    transport: Option.isSome(entry.source) ? "config" : "unknown",
    status: "unmanaged",
  }));
  const items = [...installedItems, ...unmanagedItems];

  if (yield* renderer.list("mcp-server", { items, count: items.length })) return;
  if (items.length === 0) {
    yield* renderer.info("No MCP servers installed");
    return;
  }
  yield* renderer.table(items, McpServerListTable, "Installed MCP servers");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List MCP servers from project (default) or user-level configuration"),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListMcpServers().pipe(withWorkspace(scope), withRuntime("mcps list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed MCP servers"),
  Command.withExamples([
    { command: "axm mcps list", description: "See installed MCP servers" },
    {
      command: "axm mcps list --scope user",
      description: "Check user-level MCP servers",
    },
  ]),
);
