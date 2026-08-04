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
import { PER_AGENT_EXTENSION_TYPES, type ExtensionType } from "../extensions/common.js";
import { AGENTS, AGENT_IDS, type AgentId } from "./catalog.js";
import {
  LEAF_EXTENSION_TYPES,
  SUPPORTED_AXM_SUPPORT,
  type Agent,
  type AgentExtensionCapability,
  type AxmSupport,
  type CanonicalHookEventId,
  type CanonicalHookToolId,
  type Detection,
  type HookBlockOutcome,
  type HookDecisionCapability,
  type HookEventMapping,
  type HookMechanismFamily,
  type HookModifyOperation,
  type Scope,
  type StandardsCompliance,
  type LeafExtensionType,
  type McpConfigTarget,
  type ConfigFileLocation,
  type PerAgentType,
} from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export interface CapabilityListing {
  readonly type: LeafExtensionType;
  readonly capability: AgentExtensionCapability;
}

/** @experimental This API is unstable and may change without notice. */
export type NativeAgentCapabilities = {
  readonly [Type in PerAgentType]: Agent["capabilities"][Type]["native"];
};

/** @experimental This API is unstable and may change without notice. */
export type NativeAgent = Omit<Agent, "capabilities" | "instructions" | "permissions"> & {
  readonly capabilities: NativeAgentCapabilities;
  readonly instructions: Agent["instructions"]["native"];
  readonly permissions: Agent["permissions"]["native"];
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
  "native" | "native-deprecated" | "plugin" | "plugin-deprecated" | "none";

/** @experimental This API is unstable and may change without notice. */
export type AxmIntegrationStatus = AxmSupport | "writer";

/** @experimental This API is unstable and may change without notice. */
export const agentCapabilityStatus = (
  capability: AgentExtensionCapability,
): AgentCapabilityStatus => {
  switch (capability.native.availability.via) {
    case "none":
      return "none";
    case "native":
      return capability.native.vendorStatus.state === "active" ? "native" : "native-deprecated";
    case "plugin":
      return capability.native.vendorStatus.state === "active" ? "plugin" : "plugin-deprecated";
  }
};

/** @experimental This API is unstable and may change without notice. */
export const axmIntegrationStatus = (capability: AgentExtensionCapability): AxmIntegrationStatus =>
  capability.axm.writer === null ? capability.axm.status : "writer";

/** @experimental This API is unstable and may change without notice. */
export const isCapabilitySupported = (capability: AgentExtensionCapability): boolean =>
  (capability.axm.writer !== null || capability.axm.status === SUPPORTED_AXM_SUPPORT) &&
  capability.native.availability.via !== "none";

const perAgentTypes = new Set<string>(PER_AGENT_EXTENSION_TYPES);

const isPerAgentType = (type: LeafExtensionType): type is PerAgentType => perAgentTypes.has(type);

/**
 * The capability record describing how one agent handles an extension type.
 * `rule` resolves to the agent's `instructions` slot: rules render into shared
 * workspace instruction files, but each agent still records how it consumes
 * them. `files` has no per-agent record at all — it renders to workspace paths
 * no agent owns — so it resolves to `undefined`.
 */
const capabilityForType = (
  agent: Agent,
  type: LeafExtensionType,
): AgentExtensionCapability | undefined => {
  if (type === "rule") return agent.instructions;
  if (isPerAgentType(type)) return agent.capabilities[type];
  return undefined;
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
    : agent.rootDir ||
      ("directory" in agent.capabilities.skill.native
        ? firstPathSegment(agent.capabilities.skill.native.directory)
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
  capability: AgentExtensionCapability["native"] | Agent["permissions"]["native"],
): capability is Extract<
  AgentExtensionCapability["native"] | Agent["permissions"]["native"],
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
    if (hasConfigFiles(capability.native)) {
      appendFileMarkers(markersByScope, capability.native.configFiles);
    }
  }

  if (hasConfigFiles(agent.permissions.native)) {
    appendFileMarkers(markersByScope, agent.permissions.native.configFiles);
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
  if (!("directory" in subagents.native)) return undefined;
  return {
    dir: subagents.native.directory,
    scopes: subagents.native.scopes,
    ...(subagents.native.layout === "file" ? { isFile: true } : {}),
  };
};

const deriveInstructionsDescriptor = (agent: Agent): AgentInstructionsDescriptor | undefined => {
  const instructions = agent.instructions;
  if (!isCapabilitySupported(instructions) || !("kind" in instructions.native)) return undefined;

  // A secondary native rules directory beside the instruction file. Carried
  // through so status output can report it as unsynced; AXM writes only the
  // instruction file itself.
  const rulesDir =
    "directory" in instructions.native ? { rulesDir: instructions.native.directory } : {};

  switch (instructions.native.kind) {
    case "agents-md":
      return { kind: "agents-md", ...rulesDir };
    case "own-file": {
      const file = instructions.native.files[0];
      if (file === undefined) return undefined;
      return {
        kind: "own-file",
        file,
        ...(instructions.native.importSyntax === null
          ? {}
          : { importSyntax: instructions.native.importSyntax }),
        ...rulesDir,
      };
    }
    case "rules-dir": {
      return {
        kind: "rules-dir",
        dir: instructions.native.directory,
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
    isCapabilitySupported(command) && "directory" in command.native
      ? { dir: command.native.directory, scopes: command.native.scopes }
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
      dir: "directory" in skill.native ? skill.native.directory : "",
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
    const capability = capabilityForType(agent, type);
    if (capability === undefined) continue;
    if (
      capability.axm.status !== "unsupported" ||
      capability.axm.writer !== null ||
      capability.axm.lastVerified !== null ||
      capability.native.availability.via !== "none" ||
      capability.native.sources.length > 0 ||
      capability.native.docs.length > 0 ||
      capability.native.notes !== null
    ) {
      capabilities.push({ type, capability });
    }
  }

  return capabilities;
};

/** @experimental This API is unstable and may change without notice. */
export const agentSupportsType = (agent: Agent, type: PerAgentType): boolean => {
  const capability = agent.capabilities[type];
  return isCapabilitySupported(capability);
};

/** @experimental This API is unstable and may change without notice. */
export const getSupportedExtensionTypesForAgent = (
  agent: Agent,
): ReadonlyArray<LeafExtensionType> =>
  LEAF_EXTENSION_TYPES.filter((type) => {
    const capability = capabilityForType(agent, type);
    return capability !== undefined && isCapabilitySupported(capability);
  });

// A type the catalog models no capability for is treated as unsupported, so
// `files` extensions keep reporting zero compatible agents exactly as they did
// when every agent carried an unpopulated `files` slot. Whether that is the
// right answer for a workspace-placed type is a product question, deliberately
// left unchanged here.
const agentSatisfiesType = (agent: Agent, type: LeafExtensionType): boolean => {
  const capability = capabilityForType(agent, type);
  return capability !== undefined && isCapabilitySupported(capability);
};

/**
 * Agents an extension of the given types can be installed for.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getSupportedAgentsForExtensionTypes = (
  types: ReadonlyArray<LeafExtensionType>,
  catalog: ReadonlyArray<Agent> = AGENTS,
): ReadonlyArray<Agent> => {
  if (types.length === 0) return [];
  return catalog.filter((agent) => types.every((type) => agentSatisfiesType(agent, type)));
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
export type HookDecisionKind = HookDecisionCapability["kind"];

/** @experimental This API is unstable and may change without notice. */
export type HookDecisionRequirement =
  | { readonly kind: "observe" }
  | { readonly kind: "block"; readonly outcomes?: ReadonlyArray<HookBlockOutcome> | undefined }
  | {
      readonly kind: "modify";
      readonly operations?: ReadonlyArray<HookModifyOperation> | undefined;
    };

/** @experimental This API is unstable and may change without notice. */
export interface HookInstallBinding {
  readonly on: CanonicalHookEventId;
  readonly match?:
    | {
        readonly tools?: ReadonlyArray<CanonicalHookToolId> | undefined;
      }
    | undefined;
  readonly matcherRaw?: string | undefined;
  readonly targets?:
    Readonly<Record<string, { readonly matcherRaw?: string | undefined }>> | undefined;
  readonly requires?:
    | {
        readonly decision: HookDecisionRequirement;
      }
    | undefined;
}

/** @experimental This API is unstable and may change without notice. */
export interface HookInstallabilityVerdict {
  readonly installable: boolean;
  readonly reason: string;
}

/** @experimental This API is unstable and may change without notice. */
export interface HookPortabilityRequirement {
  readonly events: ReadonlyArray<CanonicalHookEventId>;
  readonly mechanisms: ReadonlyArray<HookMechanismFamily>;
  readonly decisions: ReadonlyArray<HookDecisionKind>;
}

/** @experimental This API is unstable and may change without notice. */
export interface HookPortabilityVerdict {
  readonly standardsCompliance: StandardsCompliance;
  readonly reason: string;
}

const hookDecisionKinds = (
  decisions: ReadonlyArray<HookDecisionCapability>,
): ReadonlySet<HookDecisionKind> => new Set(decisions.map((decision) => decision.kind));

const missingValues = <T extends string>(
  required: ReadonlyArray<T>,
  available: ReadonlySet<T>,
): ReadonlyArray<T> => required.filter((value) => !available.has(value));

const unique = <T extends string>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
  Array.from(new Set(values));

/** @experimental This API is unstable and may change without notice. */
export const canonicalCoverage = (agent: Agent) => {
  const hook = agent.capabilities.hook;
  if (!("events" in hook.native)) {
    return {
      events: [],
      tools: [],
      mechanism: [],
      matcherKinds: [],
      decision: [],
    };
  }

  return {
    events: unique(hook.native.events.map((event) => event.canonical)),
    tools: unique(hook.native.tools.map((tool) => tool.canonical)),
    mechanism: unique(hook.native.mechanism),
    matcherKinds: unique(hook.native.events.map((event) => event.matcher.kind)),
    decision: hook.native.events.flatMap((event) => event.decision),
  };
};

const hookEventForBinding = (
  agent: Agent,
  binding: HookInstallBinding,
): HookEventMapping | undefined => {
  const native = agent.capabilities.hook.native;
  if (!("events" in native)) return undefined;
  return native.events.find((event) => event.canonical === binding.on);
};

const targetMatcherRaw = (agent: Agent, binding: HookInstallBinding): string | undefined =>
  binding.targets?.[agent.id]?.matcherRaw ?? binding.matcherRaw;

const bindingRequiresMatcher = (agent: Agent, binding: HookInstallBinding): boolean =>
  targetMatcherRaw(agent, binding) !== undefined || (binding.match?.tools?.length ?? 0) > 0;

const decisionRequirementSatisfied = (
  available: ReadonlyArray<HookDecisionCapability>,
  required: HookDecisionRequirement,
): boolean => available.some((decision) => decision.kind === required.kind);

/** @experimental This API is unstable and may change without notice. */
export const installable = (
  agent: Agent,
  binding: HookInstallBinding,
): HookInstallabilityVerdict => {
  const hook = agent.capabilities.hook;
  if (hook.native.availability.via === "none") {
    return { installable: false, reason: `${agent.name} has no hook system.` };
  }
  if (!("events" in hook.native)) {
    return { installable: false, reason: `${agent.name} has no modeled hook events.` };
  }
  if (hook.axm.writer === null) {
    return { installable: false, reason: `AXM has not built a hook writer for ${agent.name}.` };
  }

  const event = hookEventForBinding(agent, binding);
  if (event === undefined) {
    return {
      installable: false,
      reason: `${agent.name} does not support ${binding.on}.`,
    };
  }

  if (bindingRequiresMatcher(agent, binding) && event.matcher.kind === "none-imperative") {
    return {
      installable: false,
      reason: `${agent.name} cannot express a matcher for ${binding.on}.`,
    };
  }

  const tools = binding.match?.tools ?? [];
  if (tools.length > 0) {
    const nativeTools = new Set(hook.native.tools.map((tool) => tool.canonical));
    const missingTools = missingValues(tools, nativeTools);
    if (missingTools.length > 0) {
      return {
        installable: false,
        reason: `${agent.name} cannot express matcher tool(s): ${missingTools.join(", ")}.`,
      };
    }
  }

  const requiredDecision = binding.requires?.decision;
  if (
    requiredDecision !== undefined &&
    !decisionRequirementSatisfied(event.decision, requiredDecision)
  ) {
    return {
      installable: false,
      reason: `${agent.name} cannot satisfy ${requiredDecision.kind} decisions for ${binding.on}.`,
    };
  }

  return { installable: true, reason: `${agent.name} can install ${binding.on}.` };
};

/** @experimental This API is unstable and may change without notice. */
export const deriveHookPortability = (
  agent: Agent,
  requirement: HookPortabilityRequirement,
): HookPortabilityVerdict => {
  const hook = agent.capabilities.hook;
  if (hook.native.availability.via === "none") {
    return {
      standardsCompliance: "none",
      reason: `${agent.name} has no known native hook surface.`,
    };
  }
  if (!("events" in hook.native)) {
    return {
      standardsCompliance: "none",
      reason: `${agent.name} has no modeled native hook events.`,
    };
  }

  const coverage = canonicalCoverage(agent);
  const eventIds = new Set<CanonicalHookEventId>(coverage.events);
  const missingEvents = missingValues(requirement.events, eventIds);
  if (missingEvents.length > 0) {
    return {
      standardsCompliance: "none",
      reason: `${agent.name} does not expose required hook event(s): ${missingEvents.join(", ")}.`,
    };
  }

  const mechanisms = new Set<HookMechanismFamily>(coverage.mechanism);
  const missingMechanisms = missingValues(requirement.mechanisms, mechanisms);
  const decisions = hook.native.events.flatMap((event) => event.decision);
  const availableDecisionKinds = hookDecisionKinds(decisions);
  const missingDecisions = missingValues(requirement.decisions, availableDecisionKinds);
  const partialReasons = [
    ...(missingMechanisms.length === 0
      ? []
      : [`missing mechanism(s): ${missingMechanisms.join(", ")}`]),
    ...(missingDecisions.length === 0
      ? []
      : [`missing decision(s): ${missingDecisions.join(", ")}`]),
    ...(hook.axm.writer !== null ? [] : ["AXM has no writer"]),
  ];

  if (partialReasons.length > 0) {
    return {
      standardsCompliance: "partial",
      reason: `${agent.name} has a native hook surface, but ${partialReasons.join("; ")}.`,
    };
  }

  return {
    standardsCompliance: "full",
    reason: `${agent.name} supports the required hook events, mechanism, decisions, and AXM writer.`,
  };
};

/** @experimental This API is unstable and may change without notice. */
export const toNativeAgent = (agent: Agent): NativeAgent => ({
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
    skill: agent.capabilities.skill.native,
    command: agent.capabilities.command.native,
    "mcp-server": agent.capabilities["mcp-server"].native,
    subagent: agent.capabilities.subagent.native,
    hook: agent.capabilities.hook.native,
  },
  instructions: agent.instructions.native,
  permissions: agent.permissions.native,
});
