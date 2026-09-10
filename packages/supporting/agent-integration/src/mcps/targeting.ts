/**
 * Portable MCP server target grouping helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  CONFIGURABLE_AGENTS_BY_ID,
  type Agent,
  type ConfigurableAgentId,
  type McpConfig,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { SharedMcpTargetMember } from "./shared-target.js";

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
