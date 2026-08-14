import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { isAxmManagedMcpEntry } from "../../../mcps/metadata.js";
import type { UnmanagedMcpServer } from "../../../workspace/read-model/extensions/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule, LintFinding } from "../../rule.js";

const RULE_ID = "workspace/mcps-agent-orphaned";

const isManagedAgentEntry = (row: UnmanagedMcpServer): boolean =>
  row.actual.origin._tag === "agent-mcp-config" &&
  row.actual.config !== null &&
  isAxmManagedMcpEntry(row.actual.config);

const configuredAgentIds = (context: WorkspaceRuleContext): Effect.Effect<ReadonlySet<string>> =>
  Effect.gen(function* () {
    const settings = yield* Effect.result(context.workspace.state.settings);
    if (Result.isFailure(settings) || Option.isNone(settings.success)) {
      return new Set<string>();
    }
    return new Set(settings.success.value.agents ?? []);
  });

const findingFor = (row: UnmanagedMcpServer): AdvisoryFinding => {
  const agent = row.actual.origin._tag === "agent-mcp-config" ? row.actual.origin.agentId : "agent";
  const finding = {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "warning",
    message: `MCP server '${row.key.name}' has an orphaned AXM-owned agent config for ${agent}.`,
  } satisfies Omit<AdvisoryFinding, "location">;
  return row.actual.configFile === null
    ? finding
    : { ...finding, location: { file: row.actual.configFile } };
};

const orphanedRows = (rows: ReadonlyArray<UnmanagedMcpServer>): ReadonlyArray<UnmanagedMcpServer> =>
  rows.filter(isManagedAgentEntry);

const isConfiguredAgentRow = (
  row: UnmanagedMcpServer,
  configuredAgents: ReadonlySet<string>,
): boolean =>
  row.actual.origin._tag === "agent-mcp-config" && configuredAgents.has(row.actual.origin.agentId);

const findingsForRows = (
  rows: ReadonlyArray<UnmanagedMcpServer>,
  configuredAgents: ReadonlySet<string>,
): ReadonlyArray<LintFinding> =>
  orphanedRows(rows)
    .filter((row) => isConfiguredAgentRow(row, configuredAgents))
    .map(findingFor);

export const mcpServerAgentOrphanedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Managed MCP server agent configs are declared in AXM settings.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const rows = yield* Effect.result(context.workspace.mcpServers.unmanaged);
      if (Result.isFailure(rows)) return [];
      const agents = yield* configuredAgentIds(context);
      return findingsForRows(rows.success, agents);
    }),
};
