/**
 * Pure derivation helpers for the agent capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  AgentDescriptor,
  AgentInstructionsDescriptor,
  AgentSubagentsDescriptor,
} from "../agents/types.js";
import type { ExtensionType } from "../extensions/common.js";
import { AGENTS, AGENT_IDS, type AgentId } from "./catalog.js";
import {
  LEAF_EXTENSION_TYPES,
  SUPPORTED_LIFECYCLE,
  type Agent,
  type AgentExtensionCapability,
  type LeafExtensionType,
} from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export interface CapabilityListing {
  readonly type: LeafExtensionType;
  readonly capability: AgentExtensionCapability;
}

/** @experimental This API is unstable and may change without notice. */
export type ExtensionCompatibilityInput =
  | { readonly type: LeafExtensionType }
  | { readonly type: "pack"; readonly memberTypes: ReadonlyArray<LeafExtensionType> };

/** @experimental This API is unstable and may change without notice. */
export const isLeafExtensionType = (value: ExtensionType): value is LeafExtensionType =>
  value !== "pack";

/** @experimental This API is unstable and may change without notice. */
export const isCapabilitySupported = (capability: AgentExtensionCapability): boolean =>
  capability.lifecycle === SUPPORTED_LIFECYCLE;

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
    : agent.rootDir ||
      ("directory" in agent.capabilities.skill
        ? firstPathSegment(agent.capabilities.skill.directory)
        : undefined);

const deriveSubagentsDescriptor = (agent: Agent): AgentSubagentsDescriptor | undefined => {
  const subagents = agent.capabilities.subagent;
  if (!isCapabilitySupported(subagents)) return undefined;
  if (!("directory" in subagents)) return undefined;
  return {
    dir: subagents.directory,
    ...(subagents.layout === "file" ? { isFile: true } : {}),
  };
};

const deriveInstructionsDescriptor = (agent: Agent): AgentInstructionsDescriptor | undefined => {
  const instructions = agent.capabilities.rule;
  if (!isCapabilitySupported(instructions) || !("kind" in instructions)) return undefined;

  switch (instructions.kind) {
    case "agents-md":
      return { kind: "agents-md" };
    case "own-file": {
      const file = instructions.files[0];
      if (file === undefined) return undefined;
      return {
        kind: "own-file",
        file,
        ...(instructions.importSyntax === null ? {} : { importSyntax: instructions.importSyntax }),
      };
    }
    case "rules-dir": {
      return { kind: "rules-dir", dir: instructions.directory, format: "frontmatter" };
    }
  }
};

const hasDetectionMarkers = (agent: Agent): boolean =>
  agent.detection.projectDirs.length > 0 || agent.detection.userDirs.length > 0;

/** @experimental This API is unstable and may change without notice. */
export const deriveAgentDescriptor = (agent: Agent): AgentDescriptor => {
  const skill = agent.capabilities.skill;
  const command = agent.capabilities.command;
  const commands =
    isCapabilitySupported(command) && "directory" in command
      ? { dir: command.directory }
      : undefined;
  const subagents = deriveSubagentsDescriptor(agent);
  const instructions = deriveInstructionsDescriptor(agent);

  return {
    id: deriveAgentId(agent),
    name: agent.name,
    rootDir: deriveRootDir(agent),
    skills: {
      dir: "directory" in skill ? skill.directory : "",
    },
    ...(hasDetectionMarkers(agent) ? { detection: agent.detection } : {}),
    ...(commands === undefined ? {} : { commands }),
    ...(subagents === undefined ? {} : { subagents }),
    ...(instructions === undefined ? {} : { instructions }),
  };
};

/** @experimental This API is unstable and may change without notice. */
export const listCapabilities = (agent: Agent): ReadonlyArray<CapabilityListing> => {
  const capabilities: Array<CapabilityListing> = [];

  for (const type of LEAF_EXTENSION_TYPES) {
    const capability = agent.capabilities[type];
    if (
      capability.lifecycle !== "unsupported" ||
      capability.sources.length > 0 ||
      capability.docs.length > 0 ||
      capability.notes !== null
    ) {
      capabilities.push({ type, capability });
    }
  }

  return capabilities;
};

/** @experimental This API is unstable and may change without notice. */
export const agentSupportsType = (agent: Agent, type: LeafExtensionType): boolean => {
  const capability = agent.capabilities[type];
  return isCapabilitySupported(capability);
};

/** @experimental This API is unstable and may change without notice. */
export const getSupportedExtensionTypesForAgent = (
  agent: Agent,
): ReadonlyArray<LeafExtensionType> =>
  LEAF_EXTENSION_TYPES.filter((type) => agentSupportsType(agent, type));

/** @experimental This API is unstable and may change without notice. */
export const getSupportedAgentsForExtensionTypes = (
  types: ReadonlyArray<LeafExtensionType>,
  catalog: ReadonlyArray<Agent> = AGENTS,
): ReadonlyArray<Agent> => {
  if (types.length === 0) return [];
  return catalog.filter((agent) => types.every((type) => agentSupportsType(agent, type)));
};

/** @experimental This API is unstable and may change without notice. */
export const getSupportedAgentsForExtensionType = (
  type: LeafExtensionType,
  catalog: ReadonlyArray<Agent> = AGENTS,
): ReadonlyArray<Agent> => getSupportedAgentsForExtensionTypes([type], catalog);

/** @experimental This API is unstable and may change without notice. */
export const getSupportedAgentsForExtension = (
  extension: ExtensionCompatibilityInput,
  catalog: ReadonlyArray<Agent> = AGENTS,
): ReadonlyArray<Agent> =>
  extension.type === "pack"
    ? getSupportedAgentsForExtensionTypes(extension.memberTypes, catalog)
    : getSupportedAgentsForExtensionType(extension.type, catalog);
