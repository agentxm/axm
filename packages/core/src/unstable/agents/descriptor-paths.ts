/**
 * Catalog-backed path helpers for coding-agent services.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { AGENTS } from "./registry.js";
import type { AgentId } from "./types.js";

const descriptorFor = (agentId: AgentId) => AGENTS[agentId];

const missingCapability = (agentId: AgentId, capability: string): Error =>
  new Error(`Agent catalog entry for ${agentId} does not define ${capability}`);

/** @experimental */
export const agentSkillsDir = (agentId: AgentId): string => descriptorFor(agentId).skills.dir;

/** @experimental */
export const optionalAgentCommandsDir = (agentId: AgentId): string | undefined =>
  descriptorFor(agentId).commands?.dir;

/** @experimental */
export const requiredAgentCommandsDir = (agentId: AgentId): string => {
  const dir = optionalAgentCommandsDir(agentId);
  if (dir === undefined) throw missingCapability(agentId, "commands.dir");
  return dir;
};

/** @experimental */
export const requiredAgentSubagentsDir = (agentId: AgentId): string => {
  const dir = descriptorFor(agentId).subagents?.dir;
  if (dir === undefined) throw missingCapability(agentId, "subagents.dir");
  return dir;
};
