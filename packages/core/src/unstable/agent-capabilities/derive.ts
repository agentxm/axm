/**
 * Pure derivation helpers for the agent capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionType } from "../extensions/common.js";
import type { Agent, AgentCapability, SupportLevel } from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export const LEAF_EXTENSION_TYPES = [
  "skill",
  "command",
  "mcp-server",
  "subagent",
  "file",
  "rule",
] as const satisfies ReadonlyArray<ExtensionType>;

/** @experimental This API is unstable and may change without notice. */
export type LeafExtensionType = (typeof LEAF_EXTENSION_TYPES)[number];

/** @experimental This API is unstable and may change without notice. */
export const SUPPORT_LEVELS_THAT_WORK = [
  "standard",
  "bridged",
] as const satisfies ReadonlyArray<SupportLevel>;

/** @experimental This API is unstable and may change without notice. */
export const capabilityKinds = [
  "skills",
  "commands",
  "mcp",
  "subagents",
  "instructions",
  "rules",
  "permissions",
] as const;

/** @experimental This API is unstable and may change without notice. */
export type CapabilityKind = (typeof capabilityKinds)[number];

/** @experimental This API is unstable and may change without notice. */
export interface CapabilityListing {
  readonly type: LeafExtensionType;
  readonly capability: AgentCapability;
}

/** @experimental This API is unstable and may change without notice. */
export type ExtensionCompatibilityInput =
  | { readonly type: LeafExtensionType }
  | { readonly type: "pack"; readonly memberTypes: ReadonlyArray<LeafExtensionType> };

/** @experimental This API is unstable and may change without notice. */
export const EXTENSION_TYPE_CAPABILITY = {
  skill: (agent: Agent) => agent.skills,
  command: (agent: Agent) => agent.commands,
  "mcp-server": (agent: Agent) => agent.mcp,
  subagent: (agent: Agent) => agent.subagents,
  file: (agent: Agent) => agent.instructions,
  rule: (agent: Agent) => agent.rules,
} satisfies Record<LeafExtensionType, (agent: Agent) => AgentCapability | undefined>;

/** @experimental This API is unstable and may change without notice. */
export const isLeafExtensionType = (value: ExtensionType): value is LeafExtensionType =>
  value !== "pack";

/** @experimental This API is unstable and may change without notice. */
export const supportLevelWorks = (support: SupportLevel): boolean =>
  support === "standard" || support === "bridged";

/** @experimental This API is unstable and may change without notice. */
export const listCapabilities = (agent: Agent): ReadonlyArray<CapabilityListing> => {
  const capabilities: Array<CapabilityListing> = [];

  for (const type of LEAF_EXTENSION_TYPES) {
    const capability = EXTENSION_TYPE_CAPABILITY[type](agent);
    if (capability !== undefined) {
      capabilities.push({ type, capability });
    }
  }

  return capabilities;
};

/** @experimental This API is unstable and may change without notice. */
export const agentSupportsType = (agent: Agent, type: LeafExtensionType): boolean => {
  const capability = EXTENSION_TYPE_CAPABILITY[type](agent);
  return capability !== undefined && supportLevelWorks(capability.support);
};

/** @experimental This API is unstable and may change without notice. */
export const supportedTypes = (agent: Agent): ReadonlyArray<LeafExtensionType> =>
  LEAF_EXTENSION_TYPES.filter((type) => agentSupportsType(agent, type));

/** @experimental This API is unstable and may change without notice. */
export const worksOnAll = (
  types: ReadonlyArray<LeafExtensionType>,
  catalog: ReadonlyArray<Agent>,
): ReadonlyArray<Agent> => {
  if (types.length === 0) return [];
  return catalog.filter((agent) => types.every((type) => agentSupportsType(agent, type)));
};

/** @experimental This API is unstable and may change without notice. */
export const worksOn = (
  type: LeafExtensionType,
  catalog: ReadonlyArray<Agent>,
): ReadonlyArray<Agent> => worksOnAll([type], catalog);

/** @experimental This API is unstable and may change without notice. */
export const worksOnExtension = (
  extension: ExtensionCompatibilityInput,
  catalog: ReadonlyArray<Agent>,
): ReadonlyArray<Agent> =>
  extension.type === "pack"
    ? worksOnAll(extension.memberTypes, catalog)
    : worksOn(extension.type, catalog);
