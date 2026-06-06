/**
 * Pure derivation helpers for the agent capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  AgentDescriptor,
  AgentDetectionMarker,
  AgentInstructionsDescriptor,
  AgentSubagentsDescriptor,
} from "../agents/types.js";
import type { ExtensionType } from "../extensions/common.js";
import { AGENTS, AGENT_IDS, type AgentId } from "./catalog.js";
import {
  LEAF_EXTENSION_TYPES,
  SUPPORTED_AXM_SUPPORT,
  type Agent,
  type AgentExtensionCapability,
  type Detection,
  type Scope,
  type LeafExtensionType,
  type McpConfigTarget,
  type ConfigFileLocation,
} from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export interface CapabilityListing {
  readonly type: LeafExtensionType;
  readonly capability: AgentExtensionCapability;
}

/** @experimental This API is unstable and may change without notice. */
export type CanonicalAgentCapabilities = {
  readonly skill: Agent["capabilities"]["skill"]["canonical"];
  readonly command: Agent["capabilities"]["command"]["canonical"];
  readonly "mcp-server": Agent["capabilities"]["mcp-server"]["canonical"];
  readonly subagent: Agent["capabilities"]["subagent"]["canonical"];
  readonly files: Agent["capabilities"]["files"]["canonical"];
  readonly rule: Agent["capabilities"]["rule"]["canonical"];
  readonly hook: Agent["capabilities"]["hook"]["canonical"];
};

/** @experimental This API is unstable and may change without notice. */
export type CanonicalAgent = Omit<Agent, "capabilities" | "permissions"> & {
  readonly capabilities: CanonicalAgentCapabilities;
  readonly permissions: Agent["permissions"]["canonical"];
};

/** @experimental This API is unstable and may change without notice. */
export type ExtensionCompatibilityInput =
  | { readonly type: LeafExtensionType }
  | { readonly type: "pack"; readonly memberTypes: ReadonlyArray<LeafExtensionType> };

/** @experimental This API is unstable and may change without notice. */
export const isLeafExtensionType = (value: ExtensionType): value is LeafExtensionType =>
  value !== "pack";

/** @experimental This API is unstable and may change without notice. */
export type AgentCapabilityStatus =
  | "native"
  | "native-deprecated"
  | "plugin"
  | "plugin-deprecated"
  | "none";

/** @experimental This API is unstable and may change without notice. */
export type AxmIntegrationStatus = AgentExtensionCapability["axm"]["support"];

/** @experimental This API is unstable and may change without notice. */
export const agentCapabilityStatus = (
  capability: AgentExtensionCapability,
): AgentCapabilityStatus => {
  switch (capability.canonical.availability.via) {
    case "none":
      return "none";
    case "native":
      return capability.canonical.vendorStatus.state === "active" ? "native" : "native-deprecated";
    case "plugin":
      return capability.canonical.vendorStatus.state === "active" ? "plugin" : "plugin-deprecated";
  }
};

/** @experimental This API is unstable and may change without notice. */
export const axmIntegrationStatus = (capability: AgentExtensionCapability): AxmIntegrationStatus =>
  capability.axm.support;

/** @experimental This API is unstable and may change without notice. */
export const isCapabilitySupported = (capability: AgentExtensionCapability): boolean =>
  capability.axm.support === SUPPORTED_AXM_SUPPORT &&
  capability.canonical.availability.via !== "none";

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
      ("directory" in agent.capabilities.skill.canonical
        ? firstPathSegment(agent.capabilities.skill.canonical.directory)
        : undefined);

const detectionMarkerKey = (marker: AgentDetectionMarker): string =>
  marker.kind === "executable" ? `executable:${marker.name}` : `${marker.kind}:${marker.path}`;

const fileMarker = (path: string): AgentDetectionMarker => ({
  kind: "file",
  path,
  signal: "supporting",
  note: null,
});

const appendMarker = (
  markers: Map<string, AgentDetectionMarker>,
  marker: AgentDetectionMarker,
): void => {
  markers.set(detectionMarkerKey(marker), marker);
};

const appendFileMarkers = (
  markersByScope: Record<Scope, Map<string, AgentDetectionMarker>>,
  locations: ReadonlyArray<ConfigFileLocation | McpConfigTarget>,
): void => {
  for (const location of locations) {
    appendMarker(markersByScope[location.scope], fileMarker(location.path));
  }
};

const hasConfigFiles = (
  capability: AgentExtensionCapability["canonical"] | Agent["permissions"]["canonical"],
): capability is Extract<
  AgentExtensionCapability["canonical"] | Agent["permissions"]["canonical"],
  { readonly configFiles: ReadonlyArray<ConfigFileLocation> }
> => "configFiles" in capability;

const deriveDetection = (agent: Agent, rootDir: string | undefined): Detection => {
  const projectMarkers = new Map<string, AgentDetectionMarker>();
  const userMarkers = new Map<string, AgentDetectionMarker>();
  const markersByScope = {
    project: projectMarkers,
    user: userMarkers,
  };

  if (rootDir !== undefined) {
    appendMarker(projectMarkers, {
      kind: "dir",
      path: rootDir,
      signal: "definitive",
      note: null,
    });
  }

  const mcp = agent.capabilities["mcp-server"];
  if (mcp.axm.writer !== null) {
    appendFileMarkers(markersByScope, mcp.axm.writer.config.targets);
  }

  for (const capability of Object.values(agent.capabilities)) {
    if (hasConfigFiles(capability.canonical)) {
      appendFileMarkers(markersByScope, capability.canonical.configFiles);
    }
  }

  if (hasConfigFiles(agent.permissions.canonical)) {
    appendFileMarkers(markersByScope, agent.permissions.canonical.configFiles);
  }

  for (const marker of agent.detection.project.markers) {
    appendMarker(projectMarkers, marker);
  }

  for (const marker of agent.detection.user.markers) {
    appendMarker(userMarkers, marker);
  }

  const project = Array.from(projectMarkers.values());
  const user = Array.from(userMarkers.values());
  return {
    project: { markers: project },
    user: { markers: user },
  };
};

const deriveSubagentsDescriptor = (agent: Agent): AgentSubagentsDescriptor | undefined => {
  const subagents = agent.capabilities.subagent;
  if (!isCapabilitySupported(subagents)) return undefined;
  if (!("directory" in subagents.canonical)) return undefined;
  return {
    dir: subagents.canonical.directory,
    ...(subagents.canonical.layout === "file" ? { isFile: true } : {}),
  };
};

const deriveInstructionsDescriptor = (agent: Agent): AgentInstructionsDescriptor | undefined => {
  const instructions = agent.capabilities.rule;
  if (!isCapabilitySupported(instructions) || !("kind" in instructions.canonical)) return undefined;

  switch (instructions.canonical.kind) {
    case "agents-md":
      return { kind: "agents-md" };
    case "own-file": {
      const file = instructions.canonical.files[0];
      if (file === undefined) return undefined;
      return {
        kind: "own-file",
        file,
        ...(instructions.canonical.importSyntax === null
          ? {}
          : { importSyntax: instructions.canonical.importSyntax }),
      };
    }
    case "rules-dir": {
      return {
        kind: "rules-dir",
        dir: instructions.canonical.directory,
        format: "frontmatter",
      };
    }
  }
};

/** @experimental This API is unstable and may change without notice. */
export const deriveAgentDescriptor = (agent: Agent): AgentDescriptor => {
  const skill = agent.capabilities.skill;
  const command = agent.capabilities.command;
  const commands =
    isCapabilitySupported(command) && "directory" in command.canonical
      ? { dir: command.canonical.directory }
      : undefined;
  const subagents = deriveSubagentsDescriptor(agent);
  const instructions = deriveInstructionsDescriptor(agent);
  const rootDir = deriveRootDir(agent);
  const detection = deriveDetection(agent, rootDir);

  return {
    id: deriveAgentId(agent),
    name: agent.name,
    rootDir,
    skills: {
      dir: "directory" in skill.canonical ? skill.canonical.directory : "",
    },
    detection,
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
      capability.axm.support !== "unsupported" ||
      capability.canonical.availability.via !== "none" ||
      capability.canonical.sources.length > 0 ||
      capability.canonical.docs.length > 0 ||
      capability.canonical.notes !== null
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

/** @experimental This API is unstable and may change without notice. */
export const toCanonicalAgent = (agent: Agent): CanonicalAgent => ({
  id: agent.id,
  name: agent.name,
  vendor: agent.vendor,
  homepage: agent.homepage,
  interfaces: agent.interfaces,
  family: agent.family,
  rootDir: agent.rootDir,
  lifecycle: agent.lifecycle,
  detection: agent.detection,
  docs: agent.docs,
  capabilities: {
    skill: agent.capabilities.skill.canonical,
    command: agent.capabilities.command.canonical,
    "mcp-server": agent.capabilities["mcp-server"].canonical,
    subagent: agent.capabilities.subagent.canonical,
    files: agent.capabilities.files.canonical,
    rule: agent.capabilities.rule.canonical,
    hook: agent.capabilities.hook.canonical,
  },
  permissions: agent.permissions.canonical,
});
