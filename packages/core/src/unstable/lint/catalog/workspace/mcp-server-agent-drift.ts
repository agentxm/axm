import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { Operation } from "../../../plan/plan.js";
import {
  AGENTS_BY_ID,
  type Agent,
  type AgentId,
  type McpConfig,
} from "../../../agent-capabilities/index.js";
import { isAxmManagedMcpEntry } from "../../../mcps/metadata.js";
import { diffAgentEntry, projectExpectedEntry } from "../../../mcps/projection.js";
import type { McpServerEntry } from "../../../settings/index.js";
import type {
  ActualMcpServer,
  InstalledMcpServer,
} from "../../../workspace/read-model/extensions/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import { syncMcpServerAgentOp } from "./helpers/install-ops.js";

const RULE_ID = "workspace/mcp-server-agent-drift";

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
type ConfiguredMcpCapability = AgentMcpCapability & {
  readonly axm: {
    readonly writer: {
      readonly config: McpConfig;
    };
  };
};

const hasMcpConfig = (capability: AgentMcpCapability): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null;

const isCapabilityAgentId = (agentId: string): agentId is AgentId => agentId in AGENTS_BY_ID;

const isInlineEntry = (entry: McpServerEntry): boolean =>
  entry.command !== undefined || entry.url !== undefined;

const configuredEntry = (row: InstalledMcpServer): McpServerEntry | undefined =>
  row.installationOrigin._tag === "direct" ? row.installationOrigin.declared.entry : undefined;

const agentActuals = (actuals: ReadonlyArray<ActualMcpServer>): ReadonlyArray<ActualMcpServer> =>
  actuals.filter(
    (actual) =>
      actual.origin._tag === "agent-mcp-config" &&
      actual.config !== null &&
      isAxmManagedMcpEntry(actual.config),
  );

const configuredAgentIds = (context: WorkspaceRuleContext): Effect.Effect<ReadonlySet<string>> =>
  Effect.gen(function* () {
    const settings = yield* Effect.result(context.workspace.state.settings);
    if (Result.isFailure(settings) || Option.isNone(settings.success)) {
      return new Set<string>();
    }
    return new Set(settings.success.value.agents ?? []);
  });

const findingFor = (args: {
  readonly name: string;
  readonly actual: ActualMcpServer;
  readonly fields: ReadonlyArray<string>;
}): AutofixableFinding => {
  const finding = {
    kind: "autofixable",
    ruleId: RULE_ID,
    severity: "warning",
    message:
      `MCP server '${args.name}' has drifted agent config for ${args.actual.origin._tag === "agent-mcp-config" ? args.actual.origin.agentId : "agent"} ` +
      `(${args.fields.join(", ")}). Run \`axm lint --fix\` to reconcile managed agent configs.`,
  } satisfies Omit<AutofixableFinding, "location">;
  return args.actual.configFile === null
    ? finding
    : { ...finding, location: { file: args.actual.configFile } };
};

interface DriftedAgentConfig {
  readonly row: InstalledMcpServer;
  readonly actual: ActualMcpServer;
  readonly fields: ReadonlyArray<string>;
}

const checkActual = (args: {
  readonly row: InstalledMcpServer;
  readonly entry: McpServerEntry;
  readonly actual: ActualMcpServer;
}): DriftedAgentConfig | undefined => {
  if (args.actual.origin._tag !== "agent-mcp-config") return undefined;
  if (!isCapabilityAgentId(args.actual.origin.agentId)) return undefined;
  if (args.actual.config === null) return undefined;
  const capability = AGENTS_BY_ID[args.actual.origin.agentId].capabilities["mcp-server"];
  if (!hasMcpConfig(capability)) return undefined;
  const config = capability.axm.writer.config;
  const projected = projectExpectedEntry({
    serverName: args.row.key.name,
    entry: args.entry,
    stdio: config.stdio,
    remote: config.remote,
    nativeEnabled: config.nativeEnabled,
    envExpansion: capability.native.mcpEnvExpansion,
  });
  if (projected._tag !== "projected") return undefined;
  const drift = diffAgentEntry(projected, args.actual.config);
  return drift._tag === "drift"
    ? { row: args.row, actual: args.actual, fields: drift.fields }
    : undefined;
};

const driftedAgentConfigs = (
  rows: ReadonlyArray<InstalledMcpServer>,
  configuredAgents: ReadonlySet<string>,
): ReadonlyArray<DriftedAgentConfig> =>
  rows.flatMap((row) => {
    if (row.activation === "disabled") return [];
    const entry = configuredEntry(row);
    if (entry === undefined || !isInlineEntry(entry)) return [];
    return agentActuals(row.actual)
      .filter(
        (actual) =>
          actual.origin._tag === "agent-mcp-config" && configuredAgents.has(actual.origin.agentId),
      )
      .flatMap((actual) => {
        const drift = checkActual({ row, entry, actual });
        return drift === undefined ? [] : [drift];
      });
  });

const findingsForRows = (
  rows: ReadonlyArray<InstalledMcpServer>,
  configuredAgents: ReadonlySet<string>,
): ReadonlyArray<LintFinding> =>
  driftedAgentConfigs(rows, configuredAgents).map((drift) =>
    findingFor({
      name: drift.row.key.name,
      actual: drift.actual,
      fields: drift.fields,
    }),
  );

const operationsForRows = (
  context: WorkspaceRuleContext,
  rows: ReadonlyArray<InstalledMcpServer>,
  configuredAgents: ReadonlySet<string>,
): ReadonlyArray<Operation<string, unknown>> =>
  driftedAgentConfigs(rows, configuredAgents).flatMap((drift) => {
    if (drift.actual.origin._tag !== "agent-mcp-config") return [];
    return [
      syncMcpServerAgentOp({
        serverName: drift.row.key.name,
        agentId: drift.actual.origin.agentId,
        scope: context.subject.scope,
        force: false,
      }),
    ];
  });

export const mcpServerAgentDriftRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Managed MCP server agent configs match AXM settings.",
  kind: "autofixing",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const rows = yield* Effect.result(context.workspace.mcpServers.installed);
      if (Result.isFailure(rows)) return [];
      const agents = yield* configuredAgentIds(context);
      return findingsForRows(rows.success, agents);
    }),
  fix: (context, _finding: AutofixableFinding) =>
    Effect.gen(function* () {
      const rows = yield* Effect.result(context.workspace.mcpServers.installed);
      if (Result.isFailure(rows)) return [];
      const agents = yield* configuredAgentIds(context);
      return operationsForRows(context, rows.success, agents);
    }),
};
