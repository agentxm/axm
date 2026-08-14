import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type Agent,
  type ConfigurableAgentId,
  type McpConfig,
  type McpEnvExpansion,
} from "../../../agent-capabilities/index.js";
import { isAxmManagedMcpEntry } from "../../../mcps/metadata.js";
import {
  diffAgentEntry,
  inferInlineRemoteTransport,
  projectExpectedEntry,
} from "../../../mcps/projection.js";
import { resolveSharedMcpTarget, type SharedMcpTargetMember } from "../../../mcps/shared-target.js";
import type { McpServerEntry } from "../../../settings/index.js";
import type {
  ActualMcpServer,
  InstalledMcpServer,
} from "../../../workspace/read-model/extensions/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule, LintFinding } from "../../rule.js";

const RULE_ID = "workspace/mcps-agent-drift";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
type ConfiguredMcpCapability = AgentMcpCapability & {
  readonly native: {
    readonly mcpEnvExpansion?: McpEnvExpansion | undefined;
  };
  readonly axm: {
    readonly writer: {
      readonly config: McpConfig;
    };
  };
};

const hasMcpConfig = (capability: AgentMcpCapability): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null && "transports" in capability.native;

const isCapabilityAgentId = (agentId: string): agentId is ConfigurableAgentId =>
  agentId in CONFIGURABLE_AGENTS_BY_ID;

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
  readonly root: string;
}): AdvisoryFinding => {
  const finding = {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "warning",
    message:
      `MCP server '${args.name}' has drifted agent config for ${args.actual.origin._tag === "agent-mcp-config" ? args.actual.origin.agentId : "agent"} ` +
      `(${args.fields.join(", ")}).`,
  } satisfies Omit<AdvisoryFinding, "location">;
  return args.actual.configFile === null
    ? finding
    : { ...finding, location: { file: relativeToRoot(args.root, args.actual.configFile) } };
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
  readonly configuredAgents: ReadonlySet<string>;
}): DriftedAgentConfig | undefined => {
  if (args.actual.origin._tag !== "agent-mcp-config") return undefined;
  if (!isCapabilityAgentId(args.actual.origin.agentId)) return undefined;
  if (args.actual.config === null) return undefined;
  const capability =
    CONFIGURABLE_AGENTS_BY_ID[args.actual.origin.agentId].capabilities["mcp-server"];
  if (!hasMcpConfig(capability)) return undefined;
  const nativeConfig = capability.axm.writer.config;
  const target = nativeConfig.targets.find((candidate) => candidate.scope === args.row.key.scope);
  if (target === undefined) return undefined;
  const members: Array<SharedMcpTargetMember> = [];
  for (const agentId of args.configuredAgents) {
    if (!isCapabilityAgentId(agentId)) continue;
    const candidateCapability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
    if (!hasMcpConfig(candidateCapability)) continue;
    const candidateTarget = candidateCapability.axm.writer.config.targets.find(
      (candidate) => candidate.scope === args.row.key.scope && candidate.path === target.path,
    );
    if (candidateTarget === undefined) continue;
    members.push({
      agentId,
      config: candidateCapability.axm.writer.config,
      target: candidateTarget,
    });
  }
  const transport =
    args.entry.command !== undefined
      ? "stdio"
      : args.entry.url === undefined
        ? undefined
        : inferInlineRemoteTransport(args.entry.url);
  if (transport === undefined) return undefined;
  const resolution = resolveSharedMcpTarget({ members, transport });
  if (resolution._tag === "conflict") return undefined;
  const config = resolution.config;
  const projected = projectExpectedEntry({
    serverName: args.row.key.name,
    entry: args.entry,
    stdio: config.stdio,
    remote: config.remote,
    activationField: config.activationField,
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
    const entry = configuredEntry(row);
    if (entry === undefined || !isInlineEntry(entry)) return [];
    return agentActuals(row.actual)
      .filter(
        (actual) =>
          actual.origin._tag === "agent-mcp-config" && configuredAgents.has(actual.origin.agentId),
      )
      .flatMap((actual) => {
        const drift = checkActual({ row, entry, actual, configuredAgents });
        return drift === undefined ? [] : [drift];
      });
  });

const findingsForRows = (
  rows: ReadonlyArray<InstalledMcpServer>,
  configuredAgents: ReadonlySet<string>,
  root: string,
): ReadonlyArray<LintFinding> =>
  driftedAgentConfigs(rows, configuredAgents).map((drift) =>
    findingFor({
      name: drift.row.key.name,
      actual: drift.actual,
      fields: drift.fields,
      root,
    }),
  );

export const mcpServerAgentDriftRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Managed MCP server agent configs match AXM settings.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const rows = yield* Effect.result(context.workspace.mcpServers.installed);
      if (Result.isFailure(rows)) return [];
      const agents = yield* configuredAgentIds(context);
      return findingsForRows(rows.success, agents, context.subject.root);
    }),
};
