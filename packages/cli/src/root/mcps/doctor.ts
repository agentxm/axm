import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  removeMcpServerFromManifest,
  syncInlineMcpServerToAgent,
} from "@agentxm/client-core/unstable/agents";
import { CliRenderer, count, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  collectManagedAgentMcpServers,
  inspectMcpServerAcrossAgents,
  type AgentMcpServerInspection,
} from "@agentxm/client-core/unstable/mcps";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { previewFlag } from "@agentxm/client-core/unstable/cli-flags";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export interface McpsDoctorArgs {
  readonly fix: boolean;
  readonly preview: boolean;
}

type DoctorEntryStatus = "live" | "orphaned" | "drifted";

interface DoctorRow {
  readonly server: string;
  readonly agent: string;
  readonly status: DoctorEntryStatus;
  readonly path: string;
  readonly action: string;
  readonly detail: string;
}

type DoctorStatus = "clean" | "issues" | "previewed" | "fixed";

const DoctorTable = {
  columns: {
    server: { header: "Server" },
    agent: { header: "Agent" },
    status: { header: "Status" },
    path: { header: "Path" },
    action: { header: "Action" },
    detail: { header: "Detail" },
  },
} as const satisfies TableView<DoctorRow>;

const DoctorRowSchema = Schema.Struct({
  server: Schema.String,
  agent: Schema.String,
  status: Schema.Literals(["live", "orphaned", "drifted"] as const),
  path: Schema.String,
  action: Schema.String,
  detail: Schema.String,
});

const DoctorResultSchema = Schema.Struct({
  doctor: Schema.Struct({
    status: Schema.Literals(["clean", "issues", "previewed", "fixed"] as const),
    entryCount: Schema.Number,
    issueCount: Schema.Number,
    liveCount: Schema.Number,
    orphanCount: Schema.Number,
    driftCount: Schema.Number,
    entries: Schema.Array(DoctorRowSchema),
    orphans: Schema.Array(DoctorRowSchema),
  }),
});

const isEnabledInlineEntry = (entry: McpServerEntry): boolean =>
  entry.enabled && (entry.command !== undefined || entry.url !== undefined);

const inspectionDetail = (inspection: AgentMcpServerInspection): string => {
  if (inspection.status === "match") {
    return inspection.warnings.length > 0 ? inspection.warnings.join("; ") : "matches expected";
  }
  if (inspection.status === "absent") return "managed entry is missing";
  if (inspection.status === "unmanaged") return "entry exists but is not managed by axm";
  if (inspection.status === "drift") {
    return inspection.fields.length > 0
      ? `fields differ: ${inspection.fields.join(", ")}`
      : "entry differs";
  }
  return inspection.reason ?? "unsupported";
};

const inspectionStatus = (inspection: AgentMcpServerInspection): DoctorEntryStatus | undefined => {
  if (inspection.status === "unsupported") return undefined;
  return inspection.status === "match" ? "live" : "drifted";
};

export const handleMcpsDoctor = Effect.fn("McpsDoctor.handle")(function* (args: McpsDoctorArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredMcpServerEntries();
  const declaredNames = new Set(Object.keys(configured));
  const agentIds = yield* ws.getConfiguredAgents();
  const managed = yield* collectManagedAgentMcpServers({
    workspaceRoot: ws.baseDir,
    scope: ws.scope,
    agentIds,
  });
  const orphans = managed.filter((entry) => !declaredNames.has(entry.serverName));
  const shouldFix = args.fix && !args.preview;
  const configuredInlineEntries = Object.entries(configured).filter(
    (entry): entry is [string, McpServerEntry] => isEnabledInlineEntry(entry[1]),
  );
  const inspected = yield* Effect.forEach(
    configuredInlineEntries,
    ([serverName, entry]) =>
      inspectMcpServerAcrossAgents({
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
        agentIds,
        serverName,
        entry,
      }).pipe(Effect.map((inspections) => ({ serverName, entry, inspections }))),
    { concurrency: "unbounded" },
  );

  const drifted = inspected.flatMap(({ serverName, entry, inspections }) =>
    inspections.flatMap((inspection) =>
      inspectionStatus(inspection) === "drifted" ? [{ serverName, entry, inspection }] : [],
    ),
  );

  if (shouldFix) {
    yield* Effect.forEach(
      orphans,
      (orphan) =>
        removeMcpServerFromManifest(orphan.agentId, {
          workspaceRoot: ws.baseDir,
          scope: ws.scope,
          serverName: orphan.serverName,
          disableOnly: false,
        }),
      { concurrency: "unbounded" },
    );
    yield* Effect.forEach(
      drifted,
      ({ serverName, entry, inspection }) =>
        syncInlineMcpServerToAgent(inspection.agentId, {
          workspaceRoot: ws.baseDir,
          serverName,
          entry,
          scope: ws.scope,
        }),
      { concurrency: "unbounded" },
    );
  }

  const orphanRows = orphans.map((orphan) => ({
    server: orphan.serverName,
    agent: orphan.agentId,
    status: "orphaned" as const,
    path: orphan.path,
    action: shouldFix ? "removed" : args.fix || args.preview ? "would remove" : "report",
    detail: "not declared in workspace settings",
  }));
  const inspectionRows = inspected.flatMap(({ serverName, inspections }) =>
    inspections.flatMap((inspection) => {
      const status = inspectionStatus(inspection);
      if (status === undefined) return [];
      const isDrifted = status === "drifted";
      return [
        {
          server: serverName,
          agent: inspection.agentId,
          status,
          path: inspection.path,
          action: isDrifted
            ? shouldFix
              ? "rewritten"
              : args.fix || args.preview
                ? "would rewrite"
                : "report"
            : "none",
          detail: inspectionDetail(inspection),
        },
      ];
    }),
  );
  const rows = [...orphanRows, ...inspectionRows].sort((left, right) =>
    `${left.server}:${left.agent}:${left.status}`.localeCompare(
      `${right.server}:${right.agent}:${right.status}`,
    ),
  );
  const issueRows = rows.filter((row) => row.status !== "live");
  const liveCount = rows.filter((row) => row.status === "live").length;
  const orphanCount = orphanRows.length;
  const driftCount = rows.filter((row) => row.status === "drifted").length;
  const status: DoctorStatus =
    issueRows.length === 0
      ? "clean"
      : shouldFix
        ? "fixed"
        : args.preview || args.fix
          ? "previewed"
          : "issues";
  const result = {
    doctor: {
      status,
      entryCount: rows.length,
      issueCount: issueRows.length,
      liveCount,
      orphanCount,
      driftCount,
      entries: rows,
      orphans: orphanRows,
    },
  };
  if (yield* renderer.result(result, DoctorResultSchema)) return;

  if (issueRows.length === 0) {
    yield* renderer.success("No MCP server agent config issues found.");
    return;
  }

  const message = shouldFix
    ? `Repaired ${count(issueRows.length, "MCP server agent config issue")}.`
    : `Found ${count(issueRows.length, "MCP server agent config issue")}.`;
  yield* renderer.warn(message);
  yield* renderer.table(issueRows, DoctorTable, "MCP server agent config issues");
});

const doctorConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Inspect project (default) or user-level MCP server configuration"),
  ),
  fix: Flag.boolean("fix").pipe(
    Flag.withDescription("Remove orphaned entries and re-materialize drifted inline MCP servers"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show repairs without applying them")),
} as const;

export const doctorCommand = Command.make("doctor", doctorConfig, ({ scope, fix, preview }) =>
  handleMcpsDoctor({ fix, preview }).pipe(withWorkspace(scope), withRuntime("mcps doctor")),
).pipe(
  withArgvTracking(doctorConfig),
  Command.withAlias("reconcile"),
  Command.withDescription("Inspect and repair MCP server agent config drift"),
  Command.withExamples([
    { command: "axm mcps doctor", description: "Find MCP server agent config issues" },
    {
      command: "axm mcps doctor --fix",
      description: "Repair orphaned and drifted managed MCP server entries",
    },
  ]),
);
