import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  AGENTS_BY_ID,
  type Agent,
  type AgentId,
  type McpConfig,
  type McpTransport,
} from "../../../agent-capabilities/index.js";
import { inferInlineRemoteTransport } from "../../../mcps/projection.js";
import { resolveSharedMcpTarget, type SharedMcpTargetMember } from "../../../mcps/shared-target.js";
import type { McpServerEntry } from "../../../settings/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/mcps-shared-target-compatible";
const SETTINGS_REL = ".axm/settings.json";

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
type ConfiguredMcpCapability = AgentMcpCapability & {
  readonly native: Extract<
    AgentMcpCapability["native"],
    { readonly transports: ReadonlyArray<McpTransport> }
  >;
  readonly axm: {
    readonly writer: {
      readonly config: McpConfig;
    };
  };
};

const hasMcpConfig = (capability: AgentMcpCapability): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null && "transports" in capability.native;

const isCapabilityAgentId = (agentId: string): agentId is AgentId => agentId in AGENTS_BY_ID;

const transportFor = (entry: McpServerEntry) =>
  entry.command !== undefined
    ? "stdio"
    : entry.url === undefined
      ? undefined
      : inferInlineRemoteTransport(entry.url);

const membersByTarget = (
  agentIds: ReadonlyArray<string>,
  scope: "project" | "user",
): ReadonlyArray<ReadonlyArray<SharedMcpTargetMember>> => {
  const groups = new Map<string, Array<SharedMcpTargetMember>>();
  for (const agentId of agentIds) {
    if (!isCapabilityAgentId(agentId)) continue;
    const capability = AGENTS_BY_ID[agentId].capabilities["mcp-server"];
    if (!hasMcpConfig(capability)) continue;
    for (const target of capability.axm.writer.config.targets.filter(
      (candidate) => candidate.scope === scope,
    )) {
      const key = target.scope + ":" + target.path;
      const members = groups.get(key) ?? [];
      members.push({ agentId, config: capability.axm.writer.config, target });
      groups.set(key, members);
    }
  }
  return [...groups.values()].filter((members) => members.length > 1);
};

const findingFor = (serverName: string, path: string, reason: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    "MCP server '" +
    serverName +
    "' projects a value that another configured agent rejects in shared target '" +
    path +
    "'. " +
    reason +
    " Update the configured agents or their MCP compatibility metadata before syncing.",
  location: { file: SETTINGS_REL },
});

export const mcpServerSharedTargetCompatibleRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured agents accept the values projected into shared MCP config targets.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settings = yield* Effect.result(context.workspace.state.settings);
      if (Result.isFailure(settings) || Option.isNone(settings.success)) return [];
      const agentIds = settings.success.value.agents ?? [];
      const entries = settings.success.value.mcpServers ?? {};
      const groups = membersByTarget(agentIds, context.subject.scope);
      return Object.entries(entries).flatMap(([serverName, entry]) => {
        const transport = transportFor(entry);
        if (transport === undefined) return [];
        return groups.flatMap((members) => {
          const resolution = resolveSharedMcpTarget({ members, transport });
          return resolution._tag === "conflict"
            ? [findingFor(serverName, resolution.path, resolution.reason)]
            : [];
        });
      });
    }),
};
