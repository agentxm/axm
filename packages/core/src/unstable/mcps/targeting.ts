/**
 * Portable MCP server target-policy helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { McpServerEntry } from "../settings/index.js";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type ConfigurableAgentId,
} from "../agent-capabilities/index.js";

export const isMcpServerApplicableToAgent = (entry: McpServerEntry, agentId: string): boolean =>
  entry.agents === undefined || entry.agents.some((candidate) => candidate === agentId);

export const MCP_NOT_APPLICABLE_REASON = "MCP server is not targeted to this agent";

const isConfigurableAgentId = (agentId: string): agentId is ConfigurableAgentId =>
  Object.hasOwn(CONFIGURABLE_AGENTS_BY_ID, agentId);

export const sharedMcpTargetPolicyConflict = (args: {
  readonly entry: McpServerEntry;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}): string | undefined => {
  const targets = new Map<
    string,
    { readonly applicable: Array<string>; readonly notApplicable: Array<string> }
  >();
  for (const agentId of args.agentIds) {
    if (!isConfigurableAgentId(agentId)) continue;
    const agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
    if (agent === undefined) continue;
    const capability = agent.capabilities["mcp-server"];
    if (capability.axm.writer === null || !("transports" in capability.native)) continue;
    const applicable = isMcpServerApplicableToAgent(args.entry, agentId);
    for (const target of capability.axm.writer.config.targets.filter(
      (candidate) => candidate.scope === args.scope,
    )) {
      const key = target.scope + ":" + target.path;
      const policy = targets.get(key) ?? { applicable: [], notApplicable: [] };
      (applicable ? policy.applicable : policy.notApplicable).push(agentId);
      targets.set(key, policy);
    }
  }
  const conflict = Array.from(targets.entries()).find(
    ([, policy]) => policy.applicable.length > 0 && policy.notApplicable.length > 0,
  );
  if (conflict === undefined) return undefined;
  const [targetPath, policy] = conflict;
  return `MCP target policy cannot be represented at shared native target ${targetPath}; targeted agents ${policy.applicable.join(", ")} share it with untargeted agents ${policy.notApplicable.join(", ")}`;
};
