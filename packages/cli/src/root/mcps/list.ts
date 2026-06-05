import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import {
  inspectMcpServerAcrossAgents,
  type AgentMcpServerInspection,
} from "@agentxm/client-core/unstable/mcps";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { ADD_INLINE_MCP_SERVER, INSTALL_MCP_FROM_REGISTRY } from "../suggested-actions.js";

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
    singularLabel: "installed MCP server",
    pluralLabel: "installed MCP servers",
  },
});

const hasInlineProjection = (entry: McpServerEntry): boolean =>
  entry.command !== undefined || entry.url !== undefined;

const driftStatus = (inspections: ReadonlyArray<AgentMcpServerInspection>): string => {
  if (inspections.some((inspection) => inspection.status === "drift")) return "drift";
  if (inspections.some((inspection) => inspection.status === "unmanaged")) return "drift";
  if (inspections.some((inspection) => inspection.status === "absent")) return "missing";
  return "enabled";
};

const configuredStatus = (args: {
  readonly enabled: boolean;
  readonly configuredEntry: McpServerEntry | undefined;
  readonly inspections: ReadonlyArray<AgentMcpServerInspection>;
}): string => {
  if (!args.enabled) return "disabled";
  if (args.configuredEntry === undefined) return "enabled";
  if (!hasInlineProjection(args.configuredEntry)) return "enabled";
  return driftStatus(args.inspections);
};

export const handleListMcpServers = Effect.fn("ListMcpServers.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const installed = yield* ws.records.getInstalledMcpServers();
  const unmanaged = yield* ws.records.getUnmanagedMcpServers();
  const configuredEntries = yield* ws.getConfiguredMcpServerEntries();
  const configuredAgents = yield* ws.getConfiguredAgents();

  const installedItems = yield* Effect.forEach(
    Object.entries(installed),
    ([name, entry]) =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedMcpServer(name);
        const configuredEntry = configuredEntries[name];
        const inspections =
          configuredEntry !== undefined && hasInlineProjection(configuredEntry)
            ? yield* inspectMcpServerAcrossAgents({
                workspaceRoot: ws.baseDir,
                scope: ws.scope,
                agentIds: configuredAgents,
                serverName: name,
                entry: configuredEntry,
              })
            : [];
        return {
          name,
          version:
            Option.isSome(locked) && locked.value.type === "registry"
              ? locked.value.resolvedVersion
              : "n/a",
          transport: "auto",
          status: configuredStatus({
            enabled: !(entry.lifecycle === "configured" && !entry.enabled),
            configuredEntry,
            inspections,
          }),
        };
      }),
    { concurrency: "unbounded" },
  );
  const unmanagedItems = Object.entries(unmanaged).map(([name, entry]) => ({
    name,
    version: "n/a",
    transport: Option.isSome(entry.source) ? "config" : "unknown",
    status: "unmanaged",
  }));
  const items = [...installedItems, ...unmanagedItems];

  if (
    yield* renderer.list("mcp-server", {
      items,
      count: items.length,
      suggestions: items.length === 0 ? [INSTALL_MCP_FROM_REGISTRY, ADD_INLINE_MCP_SERVER] : [],
    })
  ) {
    return;
  }
  if (items.length === 0) return;
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
