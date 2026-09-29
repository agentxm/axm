import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { isAxmManagedMcpEntry } from "@agentxm/workspace-kernel/agent-adapters";
import type { AgentOutputInventory } from "@agentxm/workspace-kernel/projection";
import type { UnmanagedMcpServer } from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";

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
    message: `MCP server '${row.key.name}' has an orphaned AXM-marked ${target}.`,
  } satisfies Omit<AdvisoryFinding, "location">;
  return row.actual.configFile === null
    ? finding
    : { ...finding, location: { file: row.actual.configFile } };
};

const orphanedRows = (rows: ReadonlyArray<UnmanagedMcpServer>): ReadonlyArray<UnmanagedMcpServer> =>
  rows.filter(isManagedConfigEntry);

const findingsForRows = (
  rows: ReadonlyArray<UnmanagedMcpServer>,
  configuredAgents: ReadonlySet<string>,
  inventory: AgentOutputInventory,
): ReadonlyArray<LintFinding> =>
  orphanedRows(rows)
    .filter((row) =>
      inventory.outputs.some(
        (output) =>
          output.extensionType === "mcp-server" &&
          output.entryName === row.key.name &&
          output.containerPath === row.actual.configFile &&
          output.claimantAgentIds.some((agentId) => configuredAgents.has(agentId)),
      ),
    )
    .map(findingFor);

export const mcpServerAgentOrphanedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Managed MCP server agent configs are declared in AXM settings.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.agentOutputs === undefined) return [];
      const inventory = yield* context.agentOutputs;
      const rows = yield* Effect.result(context.workspace.mcpServers.unmanaged);
      if (Result.isFailure(rows)) return [];
      const agents = yield* configuredAgentIds(context);
      return findingsForRows(rows.success, agents, inventory);
    }),
};
