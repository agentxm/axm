/**
 * What an MCP server row reports: where its connection came from, what
 * resolution the workspace accepted, and whether the agents that should carry
 * it actually do.
 *
 * Local connection name, source locator, and accepted resolution are three
 * different facts and stay distinct in the row and in the machine document.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { AgentMcpServerInspection } from "@agentxm/workspace-projection";
import {
  ExtensionInventoryRowSchema,
  type ConfiguredAgentOutcome,
  type ExtensionInventory,
  type McpServerEntry,
  type McpServerLockEntry,
} from "@agentxm/workspace-state";

import type { TypeListRow } from "./type-lists.js";

/** The desired-state facts an MCP row reads: where it comes from and under which identity. */
export interface DesiredMcpServerNode {
  readonly source?: string | undefined;
  readonly identity: string;
  readonly authority?: string | undefined;
}

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
export type McpServerListQueryResult = typeof McpServerListQueryResultSchema.Type;

export type McpServerMachineSource = typeof McpServerSourceSchema.Type;
export type McpServerResolution = typeof McpServerResolutionSchema.Type;

export interface McpServerListRow extends TypeListRow {
  /** The workspace-local connection name; not the published identity. */
  readonly localName: string;
  readonly source: string;
  readonly machineSource: McpServerMachineSource;
  readonly resolution: McpServerResolution;
  readonly version: string;
  readonly transport: "config" | "auto";
  readonly status: string;
}

/** Any agent that drifted or lost the projection makes the row not simply enabled. */
const projectionStatus = (inspections: ReadonlyArray<AgentMcpServerInspection>): string => {
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
  return projectionStatus(args.inspections);
};

/** One inspection restated in the workspace's per-agent outcome vocabulary. */
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
        : inspection.status === "blocked"
          ? "blocked"
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

export const mcpServerListRows = (args: {
  readonly row: TypeListRow;
  readonly origins: ReadonlyArray<string>;
  readonly configuredEntry: McpServerEntry | undefined;
  readonly desiredNode: DesiredMcpServerNode | undefined;
  readonly locked: Option.Option<McpServerLockEntry>;
  readonly inspections: ReadonlyArray<AgentMcpServerInspection>;
}): McpServerListRow => {
  const { row, configuredEntry, desiredNode, locked, inspections } = args;
  const registryResolution =
    Option.isSome(locked) && locked.value.type === "registry" ? locked.value : undefined;
  return {
    ...row,
    localName: row.name,
    source:
      configuredEntry?.kind === "inline"
        ? "inline"
        : configuredEntry?.kind === "sourced"
          ? configuredEntry.source
          : (desiredNode?.source ?? "unmanaged"),
    machineSource:
      configuredEntry?.kind === "inline"
        ? { kind: "inline" }
        : desiredNode !== undefined && desiredNode.authority !== "inline"
          ? {
              kind: "registry",
              locator: configuredEntry?.source ?? desiredNode.source ?? desiredNode.identity,
              identity: desiredNode.identity,
            }
          : { kind: "unmanaged" },
    resolution:
      registryResolution === undefined
        ? null
        : {
            kind: "registry",
            version: registryResolution.resolvedVersion,
            integrity: registryResolution.integrity,
          },
    version: registryResolution?.resolvedVersion ?? "n/a",
    transport: args.origins.some((origin) => origin.includes("config")) ? "config" : "auto",
    status:
      row.lifecycle === "unmanaged"
        ? "unmanaged"
        : configuredStatus({
            enabled: row.enabled !== false,
            configuredEntry,
            inspections,
          }),
    agentOutcomes:
      inspections.length === 0
        ? row.agentOutcomes
        : inspections.map((inspection) => inspectionOutcome(row.name, inspection)),
  };
};

/** The machine document `axm mcps list` emits. */
export const mcpServerListDocument = (args: {
  readonly inventory: ExtensionInventory;
  readonly rows: ReadonlyArray<McpServerListRow>;
}): McpServerListQueryResult => {
  const byName = new Map(args.rows.map((row) => [row.localName, row]));
  return {
    ...args.inventory,
    items: args.inventory.items.map((item) => {
      const derived = byName.get(item.name);
      return {
        ...item,
        localName: item.name,
        source: derived?.machineSource ?? ({ kind: "unmanaged" } as const),
        resolution: derived?.resolution ?? null,
      };
    }),
  };
};
