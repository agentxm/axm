/**
 * Pure derivation helpers for the agent capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionType } from "../extensions/common.js";
import type {
  AgentDescriptor,
  AgentInstructionsDescriptor,
  AgentSubagentsDescriptor,
} from "../agents/types.js";
import { AGENT_IDS, type AgentId } from "./catalog.generated.js";
import type { Agent, AgentCapability } from "./schema.js";

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
export const capabilityWorks = (capability: AgentCapability): boolean => {
  if (capability.lifecycle !== undefined && capability.lifecycle !== "available") return false;
  if ("standardsCompliance" in capability) return capability.standardsCompliance !== "none";
  return true;
};

const catalogAgentIds = new Set<string>(AGENT_IDS);

const isCatalogAgentId = (id: string): id is AgentId => catalogAgentIds.has(id);

const deriveAgentId = (agent: Agent): AgentId => {
  if (isCatalogAgentId(agent.id)) return agent.id;
  throw new Error(`Cannot derive descriptor for unknown catalog agent id: ${agent.id}`);
};

const firstPathSegment = (path: string): string | undefined => path.split("/")[0];

const deriveRootDir = (agent: Agent): string | undefined =>
  agent.rootDir === null
    ? undefined
    : (agent.rootDir ?? firstPathSegment(agent.skills?.directory ?? ""));

const deriveSubagentsDescriptor = (agent: Agent): AgentSubagentsDescriptor | undefined => {
  const subagents = agent.subagents;
  if (subagents === undefined || !capabilityWorks(subagents)) return undefined;
  if (subagents.directory === undefined) return undefined;
  return {
    dir: subagents.directory,
    ...(subagents.layout === "file" ? { isFile: true } : {}),
  };
};

const deriveInstructionsDescriptor = (agent: Agent): AgentInstructionsDescriptor | undefined => {
  const instructions = agent.instructions;
  if (instructions === undefined || !capabilityWorks(instructions)) return undefined;

  switch (instructions.kind) {
    case "agents-md":
      return { kind: "agents-md" };
    case "own-file": {
      const file = instructions.files[0];
      if (file === undefined) return undefined;
      return {
        kind: "own-file",
        file,
        ...(instructions.importSyntax === undefined
          ? {}
          : { importSyntax: instructions.importSyntax }),
      };
    }
    case "rules-dir": {
      const dir = agent.rules?.directory;
      if (dir === undefined) return undefined;
      return { kind: "rules-dir", dir, format: "frontmatter" };
    }
    default:
      return instructions.kind satisfies never;
  }
};

/** @experimental This API is unstable and may change without notice. */
export const deriveAgentDescriptor = (agent: Agent): AgentDescriptor => {
  const commands =
    agent.commands !== undefined &&
    capabilityWorks(agent.commands) &&
    agent.commands.directory !== undefined
      ? { dir: agent.commands.directory }
      : undefined;
  const subagents = deriveSubagentsDescriptor(agent);
  const instructions = deriveInstructionsDescriptor(agent);

  return {
    id: deriveAgentId(agent),
    name: agent.name,
    rootDir: deriveRootDir(agent),
    skills: {
      dir: agent.skills?.directory ?? "",
    },
    ...(agent.detection === undefined ? {} : { detection: agent.detection }),
    ...(commands === undefined ? {} : { commands }),
    ...(subagents === undefined ? {} : { subagents }),
    ...(instructions === undefined ? {} : { instructions }),
  };
};

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
  return capability !== undefined && capabilityWorks(capability);
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
