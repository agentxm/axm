/**
 * Portable MCP server target grouping helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  CONFIGURABLE_AGENTS_BY_ID,
  isConfigurableAgentId,
  type Agent,
  type McpConfig,
  type McpTransport,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { SharedMcpTargetMember } from "./shared-target.js";

export { isConfigurableAgentId };

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
export type ConfiguredMcpCapability = AgentMcpCapability & {
  readonly native: Extract<
    AgentMcpCapability["native"],
    { readonly transports: ReadonlyArray<McpTransport> }
  >;
  readonly axm: { readonly writer: { readonly config: McpConfig } };
};

export const isConfiguredMcpCapability = (
  capability: AgentMcpCapability,
): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null && "transports" in capability.native;

/** The native MCP capability for an agent whose configuration AXM can write. */
export const configuredMcpCapability = (agentId: string): ConfiguredMcpCapability | undefined => {
  if (!isConfigurableAgentId(agentId)) return undefined;
  const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
  return isConfiguredMcpCapability(capability) ? capability : undefined;
};

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
    if (!isConfiguredMcpCapability(capability)) continue;
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
