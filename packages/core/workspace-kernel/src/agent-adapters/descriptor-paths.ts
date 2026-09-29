/**
 * Catalog-derived agent path helpers.
 *
 * Agent service implementations can have custom runtime behavior, but their
 * project-scope install paths should come from the capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";

const unsupportedCapability = (agentId: MaterializationTargetId, capability: string): never => {
  throw new Error(`Agent ${agentId} does not support ${capability}`);
};

/** @experimental */
export const agentSkillsProjectDir = (agentId: MaterializationTargetId): string => {
  const skills = AGENT_DESCRIPTORS[agentId].skills;
  if (skills === undefined) {
    return unsupportedCapability(agentId, "skills");
  }
  return (
    skills.locations.find((location) => location.scope === "project" && location.role === "primary")
      ?.path ?? unsupportedCapability(agentId, "project skills")
  );
};

/** @experimental */
export const agentSubagentsProjectDirOptional = (
  agentId: MaterializationTargetId,
): string | undefined =>
  AGENT_DESCRIPTORS[agentId].subagents?.locations.find(
    (location) => location.scope === "project" && location.role === "primary",
  )?.path;

/** @experimental */
export const agentSubagentsProjectDir = (agentId: MaterializationTargetId): string => {
  const subagents = AGENT_DESCRIPTORS[agentId].subagents;
  if (subagents === undefined) {
    return unsupportedCapability(agentId, "subagents");
  }
  return (
    subagents.locations.find(
      (location) => location.scope === "project" && location.role === "primary",
    )?.path ?? unsupportedCapability(agentId, "project subagents")
  );
};
