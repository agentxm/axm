/**
 * Portable MCP server target-policy helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { McpServerEntry } from "../settings/index.js";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type Agent,
  type ConfigurableAgentId,
  type McpConfig,
} from "../agent-capabilities/index.js";
import type { SharedMcpTargetMember } from "./shared-target.js";

export const isMcpServerApplicableToAgent = (entry: McpServerEntry, agentId: string): boolean =>
  entry.agents === undefined || entry.agents.some((candidate) => candidate === agentId);

export const MCP_NOT_APPLICABLE_REASON = "MCP server is not targeted to this agent";

const isConfigurableAgentId = (agentId: string): agentId is ConfigurableAgentId =>
  Object.hasOwn(CONFIGURABLE_AGENTS_BY_ID, agentId);

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
type ConfiguredMcpCapability = AgentMcpCapability & {
  readonly axm: { readonly writer: { readonly config: McpConfig } };
};

const hasMcpConfig = (capability: AgentMcpCapability): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null;

export interface McpTargetGroup {
  readonly key: string;
  readonly path: string;
  readonly members: ReadonlyArray<SharedMcpTargetMember>;
}

export const groupConfiguredMcpTargets = (args: {
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}): ReadonlyArray<McpTargetGroup> => {
  const groups = new Map<
    string,
    { readonly path: string; readonly members: Array<SharedMcpTargetMember> }
  >();
  for (const agentId of args.agentIds) {
    if (!isConfigurableAgentId(agentId)) continue;
    const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
    if (!hasMcpConfig(capability)) continue;
    for (const target of capability.axm.writer.config.targets) {
      if (target.scope !== args.scope) continue;
      const key = `${target.scope}:${target.path}`;
      const group = groups.get(key) ?? { path: target.path, members: [] };
      group.members.push({ agentId, config: capability.axm.writer.config, target });
      groups.set(key, group);
    }
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    path: group.path,
    members: group.members,
  }));
};

export const planMcpTargetGroups = (args: {
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly entry: McpServerEntry;
  readonly scope: "project" | "user";
}): ReadonlyArray<McpTargetGroup> =>
  groupConfiguredMcpTargets({ agentIds: args.configuredAgentIds, scope: args.scope }).flatMap(
    (group) => {
      const members = group.members.filter((member) =>
        isMcpServerApplicableToAgent(args.entry, member.agentId),
      );
      return members.length === 0 ? [] : [{ ...group, members }];
    },
  );

export const sharedMcpTargetPolicyConflict = (args: {
  readonly entry: McpServerEntry;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}): string | undefined => {
  const conflict = groupConfiguredMcpTargets(args)
    .map((group) => ({
      group,
      applicable: group.members
        .filter((member) => isMcpServerApplicableToAgent(args.entry, member.agentId))
        .map((member) => member.agentId),
      notApplicable: group.members
        .filter((member) => !isMcpServerApplicableToAgent(args.entry, member.agentId))
        .map((member) => member.agentId),
    }))
    .find((candidate) => candidate.applicable.length > 0 && candidate.notApplicable.length > 0);
  if (conflict === undefined) return undefined;
  return `MCP target policy cannot be represented at shared native target ${conflict.group.key}; targeted agents ${conflict.applicable.join(", ")} share it with untargeted agents ${conflict.notApplicable.join(", ")}`;
};
