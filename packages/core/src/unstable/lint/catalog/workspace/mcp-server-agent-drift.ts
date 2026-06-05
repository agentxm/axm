import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { AGENTS_BY_ID, type Agent, type AgentId } from "../../../agent-capabilities/index.js";
import { diffAgentEntry, projectExpectedEntry } from "../../../mcps/projection.js";
import type { McpServerEntry } from "../../../settings/index.js";
import type {
  ActualMcpServer,
  InstalledMcpServer,
} from "../../../workspace/read-model/extensions/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/mcp-server-agent-drift";

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
type FullMcpCapability = Extract<AgentMcpCapability, { readonly standardsCompliance: "full" }>;

const hasFullMcpConfig = (capability: AgentMcpCapability): capability is FullMcpCapability =>
  "config" in capability && capability.standardsCompliance === "full";

const isCapabilityAgentId = (agentId: string): agentId is AgentId => agentId in AGENTS_BY_ID;

const isInlineEntry = (entry: McpServerEntry): boolean =>
  entry.command !== undefined || entry.url !== undefined;

const configuredEntry = (row: InstalledMcpServer): McpServerEntry | undefined =>
  row.installationOrigin._tag === "direct" ? row.installationOrigin.declared.entry : undefined;

const agentActuals = (actuals: ReadonlyArray<ActualMcpServer>): ReadonlyArray<ActualMcpServer> =>
  actuals.filter(
    (actual) => actual.origin._tag === "agent-mcp-config" && actual.config?.["managedBy"] === "axm",
  );

const findingFor = (args: {
  readonly name: string;
  readonly actual: ActualMcpServer;
  readonly fields: ReadonlyArray<string>;
}): AdvisoryFinding => {
  const finding = {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "warning",
    message:
      `MCP server '${args.name}' has drifted agent config for ${args.actual.origin._tag === "agent-mcp-config" ? args.actual.origin.agentId : "agent"} ` +
      `(${args.fields.join(", ")}). Run \`axm sync --force\` to reconcile managed agent configs.`,
  } satisfies Omit<AdvisoryFinding, "location">;
  return args.actual.configFile === null
    ? finding
    : { ...finding, location: { file: args.actual.configFile } };
};

const checkActual = (args: {
  readonly row: InstalledMcpServer;
  readonly entry: McpServerEntry;
  readonly actual: ActualMcpServer;
}): ReadonlyArray<AdvisoryFinding> => {
  if (args.actual.origin._tag !== "agent-mcp-config") return [];
  if (!isCapabilityAgentId(args.actual.origin.agentId)) return [];
  if (args.actual.config === null) return [];
  const capability = AGENTS_BY_ID[args.actual.origin.agentId].capabilities["mcp-server"];
  if (!hasFullMcpConfig(capability)) return [];
  const projected = projectExpectedEntry({
    serverName: args.row.key.name,
    entry: args.entry,
    stdio: capability.config.stdio,
    remote: capability.config.remote,
    nativeEnabled: capability.config.nativeEnabled,
    envExpansion: capability.mcpEnvExpansion,
  });
  if (projected._tag !== "projected") return [];
  const drift = diffAgentEntry(projected, args.actual.config);
  return drift._tag === "drift"
    ? [findingFor({ name: args.row.key.name, actual: args.actual, fields: drift.fields })]
    : [];
};

const checkRows = (rows: ReadonlyArray<InstalledMcpServer>): ReadonlyArray<AdvisoryFinding> =>
  rows.flatMap((row) => {
    if (row.activation === "disabled") return [];
    const entry = configuredEntry(row);
    if (entry === undefined || !isInlineEntry(entry)) return [];
    return agentActuals(row.actual).flatMap((actual) => checkActual({ row, entry, actual }));
  });

export const mcpServerAgentDriftRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Managed MCP server agent configs match AXM settings.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const rows = yield* Effect.result(context.workspace.mcpServers.installed);
      if (Result.isFailure(rows)) return [];
      return checkRows(rows.success);
    }),
};
