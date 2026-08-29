/**
 * Catalog-derived agent path helpers.
 *
 * Agent service implementations can have custom runtime behavior, but their
 * project-scope install paths should come from the capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { AGENTS } from "./registry.js";
import type { AgentId } from "./types.js";

const unsupportedCapability = (agentId: AgentId, capability: string): never => {
  throw new Error(`Agent ${agentId} does not support ${capability}`);
};

/** @experimental */
export const agentSkillsProjectDir = (agentId: AgentId): string => {
  const skills = AGENTS[agentId].skills;
  if (skills === undefined) {
    return unsupportedCapability(agentId, "skills");
  }
  return skills.dir;
};

/** @experimental */
export const agentSubagentsProjectDirOptional = (agentId: AgentId): string | undefined =>
  AGENTS[agentId].subagents?.dir;

/** @experimental */
export const agentSubagentsProjectDir = (agentId: AgentId): string => {
  const subagents = AGENTS[agentId].subagents;
  if (subagents === undefined) {
    return unsupportedCapability(agentId, "subagents");
  }
  return subagents.dir;
};
