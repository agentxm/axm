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

import type {
  AgentMcpServerInspection,
  DesiredMcpServerInspection,
} from "../../projection/index.js";
import {
  ExtensionInventoryRowSchema,
  type ExtensionInventory,
  type McpServerEntry,
  type McpServerLockEntry,
} from "../../desired-state/index.js";

import type { TypeListRow } from "./type-lists.js";
import {
  desiredMcpSourceKey,
  formatDesiredIdentity,
  type DesiredNodeIdentity,
} from "../../desired-state/index.js";

/** The desired-state facts an MCP row reads: where it comes from and under which identity. */
export interface DesiredMcpServerNode {
  readonly source?: string | undefined;
  readonly identity: DesiredNodeIdentity;
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
  leftoverCount: Schema.Number,
  undeclaredCount: Schema.Number,
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
  readonly inspection: DesiredMcpServerInspection | undefined;
}): string => {
  if (!args.enabled) return "disabled";
  if (args.inspection === undefined) return "enabled";
  return projectionStatus(args.inspection.inspections);
};

export const mcpServerListRows = (args: {
  readonly row: TypeListRow;
  readonly origins: ReadonlyArray<string>;
  readonly configuredEntry: McpServerEntry | undefined;
  readonly desiredNode: DesiredMcpServerNode | undefined;
  readonly locked: Option.Option<McpServerLockEntry>;
  /** The projection's judgment of the connection, when it is desired and enabled. */
  readonly inspection: DesiredMcpServerInspection | undefined;
}): McpServerListRow => {
  const { row, configuredEntry, desiredNode, locked, inspection } = args;
  const registryResolution =
    Option.isSome(locked) && locked.value.source.type === "registry"
      ? locked.value.resolved
      : undefined;
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
              locator:
                configuredEntry?.source ??
                desiredNode.source ??
                formatDesiredIdentity(desiredNode.identity),
              identity: desiredMcpSourceKey(desiredNode.identity),
            }
          : { kind: "unmanaged" },
    resolution:
      registryResolution === undefined
        ? null
        : {
            kind: "registry",
            version: "version" in registryResolution ? registryResolution.version : "n/a",
            integrity: "integrity" in registryResolution ? registryResolution.integrity : "",
          },
    version:
      registryResolution !== undefined && "version" in registryResolution
        ? registryResolution.version
        : "n/a",
    transport: args.origins.some((origin) => origin.includes("config")) ? "config" : "auto",
    status:
      row.lifecycle === "configured" || row.lifecycle === "implicit"
        ? configuredStatus({ enabled: row.enabled !== false, inspection })
        : row.lifecycle,
    agentOutcomes:
      inspection === undefined || inspection.outcomes.length === 0
        ? row.agentOutcomes
        : inspection.outcomes,
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
