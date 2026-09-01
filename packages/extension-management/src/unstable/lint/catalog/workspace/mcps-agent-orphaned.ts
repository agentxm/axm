import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { isAxmManagedMcpEntry } from "@agentxm/workspace-state";
import { groupConfiguredMcpTargets } from "../../../mcps/targeting.js";
import type { UnmanagedMcpServer } from "@agentxm/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type {
  AdvisoryFinding,
  AdvisoryRule,
  LintFinding,
} from "@agentxm/registry-protocol/unstable/lint/rule";

const RULE_ID = "workspace/mcps-agent-orphaned";

const isManagedConfigEntry = (row: UnmanagedMcpServer): boolean =>
  (row.actual.origin._tag === "agent-mcp-config" ||
    row.actual.origin._tag === "workspace-mcp-config") &&
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
  const target =
    row.actual.origin._tag === "agent-mcp-config"
      ? `agent config for ${row.actual.origin.agentId}`
      : "shared config";
  const finding = {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "warning",
    message: `MCP server '${row.key.name}' has an orphaned AXM-owned ${target}.`,
  } satisfies Omit<AdvisoryFinding, "location">;
  return row.actual.configFile === null
    ? finding
    : { ...finding, location: { file: row.actual.configFile } };
};

const orphanedRows = (rows: ReadonlyArray<UnmanagedMcpServer>): ReadonlyArray<UnmanagedMcpServer> =>
  rows.filter(isManagedConfigEntry);

const configFileMatchesTarget = (configFile: string, targetPath: string): boolean =>
  configFile === targetPath ||
  configFile.endsWith(`/${targetPath}`) ||
  (targetPath.startsWith("~/") && configFile.endsWith(`/${targetPath.slice(2)}`));

const isConfiguredAgentRow = (
  row: UnmanagedMcpServer,
  configuredAgents: ReadonlySet<string>,
): boolean =>
  row.actual.origin._tag === "agent-mcp-config"
    ? configuredAgents.has(row.actual.origin.agentId)
    : row.actual.configFile !== null &&
      groupConfiguredMcpTargets({
        agentIds: [...configuredAgents],
        scope: row.key.scope,
      }).some((group) => {
        const [first] = group.members;
        return (
          first !== undefined &&
          first.target.attribution === "shared" &&
          configFileMatchesTarget(row.actual.configFile ?? "", first.target.path)
        );
      });

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
