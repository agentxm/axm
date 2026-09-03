import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { Screen, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import {
  inspectMcpServerAcrossAgents,
  type AgentMcpServerInspection,
} from "@agentxm/extension-workspace";
import type { McpServerEntry } from "@agentxm/workspace-state";
import {
  type ConfiguredAgentOutcome,
  ExtensionInventoryRowSchema,
  WorkspaceMutations,
} from "@agentxm/workspace-state";
import * as Schema from "effect/Schema";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  augmentInventory,
  inventoryState,
  inventoryAgentOutcomes,
  inventorySummary,
} from "../inventory-view.js";

interface McpServerListItem {
  readonly localName: string;
  readonly source: string;
  readonly state: string;
  readonly version: string;
  readonly transport: string;
  readonly status: string;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const McpServerListColumns = [
  { header: "Local name", value: (row: McpServerListItem) => row.localName },
  { header: "Source", value: (row: McpServerListItem) => row.source },
  { header: "State", value: (row: McpServerListItem) => row.state },
  { header: "Version", value: (row: McpServerListItem) => row.version },
  { header: "Transport", value: (row: McpServerListItem) => row.transport },
  { header: "Status", value: (row: McpServerListItem) => row.status },
  {
    header: "Agent outcomes",
    value: (row: McpServerListItem) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<McpServerListItem>>;

const McpServerSourceSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("inline") }),
  Schema.Struct({
    kind: Schema.Literal("registry"),
    locator: Schema.String,
    identity: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("unmanaged") }),
]);

const McpServerResolutionSchema = Schema.NullOr(
  Schema.Struct({
    kind: Schema.Literal("registry"),
    version: Schema.String,
    integrity: Schema.String,
  }),
);

export const McpServerListQueryResultSchema = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      ...ExtensionInventoryRowSchema.fields,
      localName: Schema.String,
      source: McpServerSourceSchema,
      resolution: McpServerResolutionSchema,
    }),
  ),
  count: Schema.Number,
  configuredCount: Schema.Number,
  implicitCount: Schema.Number,
  installedCount: Schema.Number,
  unmanagedCount: Schema.Number,
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
  const screen = yield* Screen;
  const ws = yield* WorkspaceMutations;
  const inventory = yield* ws.records.getExtensionInventory("mcp-server", {});
  const configuredEntries = yield* ws.getConfiguredMcpServerEntries();
  const configuredAgents = yield* ws.getConfiguredAgents();
  const graph = yield* ws.getDesiredStateGraph();

  const items = yield* Effect.forEach(
    inventory.items,
    (row) =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedMcpServerForConnection(row.name);
        const configuredEntry = configuredEntries[row.name];
        const desiredNode = graph.nodes.find(
          (node) => node.type === "mcp-server" && node.name === row.name,
        );
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
          localName: row.name,
          source:
            configuredEntry?.kind === "inline"
              ? "inline"
              : configuredEntry?.kind === "sourced"
                ? configuredEntry.source
                : (desiredNode?.source ?? "unmanaged"),
          machineSource:
            configuredEntry?.kind === "inline"
              ? ({ kind: "inline" } as const)
              : desiredNode !== undefined && desiredNode.authority !== "inline"
                ? ({
                    kind: "registry",
                    locator: configuredEntry?.source ?? desiredNode.source,
                    identity: desiredNode.identity,
                  } as const)
                : ({ kind: "unmanaged" } as const),
          resolution:
            locked._tag === "Some" && locked.value.type === "registry"
              ? ({
                  kind: "registry",
                  version: locked.value.resolvedVersion,
                  integrity: locked.value.integrity,
                } as const)
              : null,
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
  const details = new Map(items.map((item) => [item.localName, item]));
  const augmented = augmentInventory(inventory, (row) => {
    const item = details.get(row.name);
    return {
      version: item?.version ?? "n/a",
      transport: item?.transport ?? "auto",
      status: item?.status ?? "n/a",
      agentOutcomes: item?.agentOutcomes ?? row.agentOutcomes,
    };
  });
  const output = {
    ...augmented,
    items: augmented.items.map((row) => {
      const detail = details.get(row.name);
      return {
        ...row,
        localName: row.name,
        source: detail?.machineSource ?? ({ kind: "unmanaged" } as const),
        resolution: detail?.resolution ?? null,
      };
    }),
  };

  if (yield* screen.document(output, McpServerListQueryResultSchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows: items,
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
  Command.withDescription("List detected MCP servers and their lifecycle classification"),
  Command.withExamples([
    { command: "axm mcps list", description: "Inventory detected MCP servers" },
    {
      command: "axm mcps list --scope user",
      description: "Check user-level MCP servers",
    },
  ]),
);
