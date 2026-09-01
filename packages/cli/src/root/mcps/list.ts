import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/extension-management/unstable/cli-renderer";
import {
  inspectMcpServerAcrossAgents,
  type AgentMcpServerInspection,
} from "@agentxm/extension-management/unstable/mcps";
import type { McpServerEntry } from "@agentxm/workspace-state";
import {
  type ConfiguredAgentOutcome,
  ExtensionInventorySchema,
  WorkspaceMutations,
} from "@agentxm/workspace-state";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  augmentInventory,
  inventoryState,
  inventoryAgentOutcomes,
  inventorySummary,
  renderEmptyInventory,
  renderInventoryTable,
} from "../extension-inventory.js";

interface McpServerListItem {
  readonly name: string;
  readonly state: string;
  readonly version: string;
  readonly transport: string;
  readonly status: string;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const McpServerListTable = {
  columns: {
    name: { header: "Name" },
    state: { header: "State" },
    version: { header: "Version" },
    transport: { header: "Transport" },
    status: { header: "Status" },
    agentOutcomes: { header: "Agent outcomes", render: inventoryAgentOutcomes },
  },
} as const satisfies TableView<McpServerListItem>;

registerEntity<McpServerListItem>("mcp-server", {
  list: {
    columns: McpServerListTable.columns,
    emptyMessage: "No MCP servers found",
    singularLabel: "MCP server",
    pluralLabel: "MCP servers",
  },
});

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
  return driftStatus(args.inspections);
};

const inspectionOutcome = (
  name: string,
  inspection: AgentMcpServerInspection,
): ConfiguredAgentOutcome => ({
  extensionType: "mcp-server",
  name,
  agentId: inspection.agentId,
  outcome:
    inspection.status === "match"
      ? "current"
      : inspection.status === "not-applicable"
        ? "not-applicable"
        : inspection.status === "unsupported"
          ? "unsupported"
          : "failed",
  reasonCode:
    inspection.status === "absent"
      ? "projection-missing"
      : inspection.status === "drift"
        ? "stale-projection"
        : `mcp-${inspection.status}`,
  reason:
    inspection.reason ??
    (inspection.status === "absent"
      ? `The expected ${inspection.agentId} projection is missing.`
      : inspection.status === "drift"
        ? `The expected ${inspection.agentId} projection is stale.`
        : `MCP projection status is ${inspection.status}.`),
  path: inspection.path,
});

export const handleListMcpServers = Effect.fn("ListMcpServers.handle")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("mcp-server", {});
  const configuredEntries = yield* ws.getConfiguredMcpServerEntries();
  const configuredAgents = yield* ws.getConfiguredAgents();

  const items = yield* Effect.forEach(
    inventory.items,
    (row) =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedMcpServer(row.name);
        const configuredEntry = configuredEntries[row.name];
        const inspections =
          row.enabled !== false &&
          row.classification.lifecycle !== "unmanaged" &&
          configuredEntry !== undefined
            ? yield* inspectMcpServerAcrossAgents({
                workspaceRoot: ws.baseDir,
                scope: ws.scope,
                agentIds: configuredAgents,
                serverName: row.name,
                entry: configuredEntry,
              })
            : [];
        const status =
          row.classification.lifecycle === "unmanaged"
            ? "unmanaged"
            : configuredStatus({
                enabled: row.enabled !== false,
                configuredEntry,
                inspections,
              });
        return {
          name: row.name,
          state: inventoryState(row),
          version:
            locked._tag === "Some" && locked.value.type === "registry"
              ? locked.value.resolvedVersion
              : "n/a",
          transport: row.origins.some((origin) => origin.includes("config")) ? "config" : "auto",
          status,
          agentOutcomes:
            inspections.length === 0
              ? row.agentOutcomes
              : inspections.map((inspection) => inspectionOutcome(row.name, inspection)),
        };
      }),
    { concurrency: "unbounded" },
  );
  const details = new Map(items.map((item) => [item.name, item]));
  const output = augmentInventory(inventory, (row) => {
    const item = details.get(row.name);
    return {
      version: item?.version ?? "n/a",
      transport: item?.transport ?? "auto",
      status: item?.status ?? "n/a",
      agentOutcomes: item?.agentOutcomes ?? row.agentOutcomes,
    };
  });

  if (yield* renderer.result(output, ExtensionInventorySchema)) return;
  if (items.length === 0) {
    yield* renderEmptyInventory(renderer, "No MCP servers found");
    return;
  }
  yield* renderInventoryTable(
    renderer,
    items,
    McpServerListTable,
    inventorySummary(inventory, "MCP server"),
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
  Command.withDescription("List detected MCP servers and their lifecycle classification"),
  Command.withExamples([
    { command: "axm mcps list", description: "Inventory detected MCP servers" },
    {
      command: "axm mcps list --scope user",
      description: "Check user-level MCP servers",
    },
  ]),
);
