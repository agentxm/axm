import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  CliRenderer,
  type DetailView,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  inspectMcpServerAcrossAgents,
  type AgentMcpServerInspection,
} from "@agentxm/client-core/unstable/mcps";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

interface McpServerGetSummary {
  readonly name: string;
  readonly enabled: string;
  readonly source: string;
  readonly transport: string;
  readonly version: string;
}

interface McpServerAgentRow {
  readonly agent: string;
  readonly status: string;
  readonly path: string;
  readonly detail: string;
}

const McpServerGetDetail = {
  fields: {
    name: { label: "Name" },
    enabled: { label: "Enabled" },
    source: { label: "Source" },
    transport: { label: "Transport" },
    version: { label: "Version" },
  },
} as const satisfies DetailView<McpServerGetSummary>;

const AgentTable = {
  columns: {
    agent: { header: "Agent" },
    status: { header: "Status" },
    path: { header: "Path" },
    detail: { header: "Detail" },
  },
} as const satisfies TableView<McpServerAgentRow>;

const AgentInspectionSchema = Schema.Struct({
  agent: Schema.String,
  status: Schema.String,
  path: Schema.String,
  fields: Schema.Array(Schema.String),
  warnings: Schema.Array(Schema.String),
  reason: Schema.optional(Schema.String),
});

const McpServerGetResultSchema = Schema.Struct({
  mcpServer: Schema.Struct({
    name: Schema.String,
    enabled: Schema.Boolean,
    source: Schema.String,
    transport: Schema.String,
    version: Schema.String,
    agents: Schema.Array(AgentInspectionSchema),
  }),
});

const transportFor = (entry: McpServerEntry): string => {
  if (entry.command !== undefined) return "stdio";
  if (entry.url !== undefined) return entry.url.endsWith("/sse") ? "sse" : "http";
  return "registry";
};

const sourceFor = (entry: McpServerEntry): string => {
  if (entry.source !== undefined) return entry.source;
  if (entry.command !== undefined) return "inline";
  if (entry.url !== undefined) return "inline";
  return "unknown";
};

const detailForInspection = (inspection: AgentMcpServerInspection): string => {
  if (inspection.reason !== undefined) return inspection.reason;
  if (inspection.status === "drift") return inspection.fields.join(", ");
  if (inspection.warnings.length > 0) return inspection.warnings.join("; ");
  return "";
};

const rowForInspection = (inspection: AgentMcpServerInspection): McpServerAgentRow => ({
  agent: inspection.agentId,
  status: inspection.status,
  path: inspection.path,
  detail: detailForInspection(inspection),
});

const lockedVersion = (locked: unknown): string => {
  if (typeof locked !== "object" || locked === null) return "n/a";
  if (!("type" in locked) || locked.type !== "registry") return "n/a";
  if (!("resolvedVersion" in locked) || typeof locked.resolvedVersion !== "string") return "n/a";
  return locked.resolvedVersion;
};

export const handleGetMcpServer = Effect.fn("GetMcpServer.handle")(function* (args: {
  readonly name: string;
}) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredMcpServerEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    return yield* makeAppError({
      code: "usage",
      detail: `MCP server "${args.name}" is not configured`,
    });
  }

  const locked = yield* ws.getLockedMcpServer(args.name);
  const agentIds = yield* ws.getConfiguredAgents();
  const inspections = yield* inspectMcpServerAcrossAgents({
    workspaceRoot: ws.baseDir,
    scope: ws.scope,
    agentIds,
    serverName: args.name,
    entry,
  });
  const agents = inspections.map((inspection) => ({
    agent: inspection.agentId,
    status: inspection.status,
    path: inspection.path,
    fields: [...inspection.fields],
    warnings: [...inspection.warnings],
    ...(inspection.reason === undefined ? {} : { reason: inspection.reason }),
  }));
  const version = Option.isSome(locked) ? lockedVersion(locked.value) : "n/a";
  const result = {
    mcpServer: {
      name: args.name,
      enabled: entry.enabled,
      source: sourceFor(entry),
      transport: transportFor(entry),
      version,
      agents,
    },
  };
  if (yield* renderer.result(result, McpServerGetResultSchema)) return;

  yield* renderer.detail(
    {
      name: args.name,
      enabled: entry.enabled ? "yes" : "no",
      source: sourceFor(entry),
      transport: transportFor(entry),
      version,
    },
    McpServerGetDetail,
    `MCP server ${args.name}`,
  );
  yield* renderer.table(inspections.map(rowForInspection), AgentTable, "Agent MCP configs");
});

const getConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the MCP server to inspect")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Inspect project (default) or user-level MCP server configuration"),
  ),
} as const;

export const getCommand = Command.make("get", getConfig, ({ name, scope }) =>
  handleGetMcpServer({ name }).pipe(withWorkspace(scope), withRuntime("mcps get")),
).pipe(
  withArgvTracking(getConfig),
  Command.withDescription("Inspect one MCP server"),
  Command.withExamples([
    { command: "axm mcps get linear", description: "Inspect one MCP server" },
    {
      command: "axm mcps get linear --scope user",
      description: "Inspect a user-level MCP server",
    },
  ]),
);
