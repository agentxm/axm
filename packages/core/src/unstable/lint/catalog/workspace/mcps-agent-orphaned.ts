import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { Operation } from "../../../plan/plan.js";
import { isAxmManagedMcpEntry } from "../../../mcps/metadata.js";
import type { UnmanagedMcpServer } from "../../../workspace/read-model/extensions/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import { removeMcpServerAgentOp } from "./helpers/install-ops.js";

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

const findingFor = (row: UnmanagedMcpServer): AutofixableFinding => {
  const agent = row.actual.origin._tag === "agent-mcp-config" ? row.actual.origin.agentId : "agent";
  const finding = {
    kind: "autofixable",
    ruleId: RULE_ID,
    severity: "warning",
    message: `MCP server '${row.key.name}' has an orphaned managed agent config for ${agent}. Run \`axm lint --fix\` to remove it.`,
  } satisfies Omit<AutofixableFinding, "location">;
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

const operationsForRows = (
  context: WorkspaceRuleContext,
  rows: ReadonlyArray<UnmanagedMcpServer>,
  configuredAgents: ReadonlySet<string>,
): ReadonlyArray<Operation<string, unknown>> =>
  orphanedRows(rows)
    .filter((row) => isConfiguredAgentRow(row, configuredAgents))
    .flatMap((row) => {
      if (row.actual.origin._tag !== "agent-mcp-config") return [];
      return [
        removeMcpServerAgentOp({
          serverName: row.key.name,
          agentId: row.actual.origin.agentId,
          scope: context.subject.scope,
        }),
      ];
    });

export const mcpServerAgentOrphanedRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Managed MCP server agent configs are declared in AXM settings.",
  kind: "autofixing",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const rows = yield* Effect.result(context.workspace.mcpServers.unmanaged);
      if (Result.isFailure(rows)) return [];
      const agents = yield* configuredAgentIds(context);
      return findingsForRows(rows.success, agents);
    }),
  fix: (context, _finding: AutofixableFinding) =>
    Effect.gen(function* () {
      const rows = yield* Effect.result(context.workspace.mcpServers.unmanaged);
      if (Result.isFailure(rows)) return [];
      const agents = yield* configuredAgentIds(context);
      return operationsForRows(context, rows.success, agents);
    }),
};
