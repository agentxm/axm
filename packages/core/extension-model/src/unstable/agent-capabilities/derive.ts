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
import { AGENTS } from "./catalog.js";
import { isConfigurableAgentId, type ConfigurableAgentId } from "./identity.js";
import { LEAF_EXTENSION_TYPES, type LeafExtensionType } from "../extension-types/schema.js";
import {
  SUPPORTED_AXM_SUPPORT,
  type Agent,
  type AgentExtensionCapability,
  type AxmSupport,
  type CanonicalHookEventId,
  type Detection,
  type HookBlockOutcome,
  type HookDecisionCapability,
  type HookMechanismFamily,
  type HookModifyOperation,
  type Scope,
  type StandardsCompliance,
  type NativeReadLocation,
} from "./schema.js";
import { type PerAgentType } from "../extensions/common.js";

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
  "native" | "native-deprecated" | "plugin" | "plugin-deprecated" | "none" | "unknown";

/** @experimental This API is unstable and may change without notice. */
export type AxmIntegrationStatus = AxmSupport | "writer";

/** @experimental This API is unstable and may change without notice. */
export const agentCapabilityStatus = (
  capability: AgentExtensionCapability,
): AgentCapabilityStatus => {
  switch (capability.native.availability.via) {
    case "unknown":
      return "unknown";
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
  !("modeling" in capability.native && capability.native.modeling === "native-unmodeled") &&
  (capability.native.availability.via === "native" ||
    capability.native.availability.via === "plugin") &&
  capability.native.vendorStatus.state !== "removed";

const perAgentTypes = new Set<string>(PER_AGENT_EXTENSION_TYPES);

const isPerAgentType = (type: LeafExtensionType): type is PerAgentType => perAgentTypes.has(type);

/**
 * The capability record describing how one agent handles an extension type.
 * `rule` resolves to the agent's `instructions` slot: rules render into shared
 * workspace instruction files, but each agent still records how it consumes
 * them. `knowledge` has no per-agent record because it is read on demand, so
 * it resolves to `undefined`.
 */
const capabilityForType = (
  agent: Agent,
  type: LeafExtensionType,
): AgentExtensionCapability | undefined => {
  if (type === "rule") return agent.instructions;
  if (isPerAgentType(type)) return agent.capabilities[type];
  return undefined;
};

const deriveAgentId = (agent: Agent): ConfigurableAgentId => {
  if (isConfigurableAgentId(agent.id)) return agent.id;
  throw new Error(`Cannot derive filesystem descriptor for non-configurable agent: ${agent.id}`);
};

const firstPathSegment = (path: string): string | undefined =>
  path.split("/").find((segment) => segment.length > 0);

const deriveRootDir = (agent: Agent): string | undefined =>
  agent.rootDir === null
    ? undefined
    : agent.rootDir ||
      ("locations" in agent.capabilities.skill.native
        ? firstPathSegment(
            agent.capabilities.skill.native.locations.find(
              (location) => location.scope === "project" && location.role === "primary",
            )?.path ?? "",
          )
        : undefined);

/** @experimental This API is unstable and may change without notice. */
export const deriveSkillConvention = (directory: string): "universal" | "vendor" =>
  directory === ".agents/skills" || directory.startsWith(".agents/skills/")
    ? "universal"
    : "vendor";

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
  locations: ReadonlyArray<NativeReadLocation>,
): void => {
  for (const location of locations) {
    if (
      location.shape !== "file" ||
      location.applicability.kind !== "always" ||
      location.root === "xdg-config"
    )
      continue;
    appendMarker(
      markersByScope[location.scope],
      fileMarker(location.root === "home" ? `~/${location.path}` : location.path),
    );
  }
};

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

  for (const [kind, capability] of Object.entries(agent.capabilities)) {
    if (kind !== "mcp-server" && kind !== "hook") continue;
    if (!("locations" in capability.native)) continue;
    const locations =
      kind === "mcp-server"
        ? capability.native.locations.filter(
            (location) => !("attribution" in location) || location.attribution !== "shared",
          )
        : capability.native.locations;
    appendFileMarkers(markersByScope, locations);
  }
  if ("locations" in agent.permissions.native)
    appendFileMarkers(markersByScope, agent.permissions.native.locations);

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
  if (!("locations" in subagents.native)) return undefined;
  return {
    locations: subagents.native.locations,
    scopes: subagents.native.scopes,
    writerSupported: isCapabilitySupported(subagents),
  };
};

const deriveInstructionsDescriptor = (agent: Agent): AgentInstructionsDescriptor | undefined => {
  const instructions = agent.instructions;
  if (!("kind" in instructions.native)) return undefined;
  return {
    kind: instructions.native.kind,
    locations: instructions.native.locations,
    scopes: instructions.native.scopes,
    writerSupported: isCapabilitySupported(instructions),
    ...(instructions.native.importSyntax === null
      ? {}
      : { importSyntax: instructions.native.importSyntax }),
  };
};

/** @experimental This API is unstable and may change without notice. */
export const deriveAgentDescriptor = (agent: Agent): AgentDescriptor => {
  const subagents = deriveSubagentsDescriptor(agent);
  const instructions = deriveInstructionsDescriptor(agent);
  const rootDir = deriveRootDir(agent);
  const detection = deriveDetection(agent, rootDir);
  const skills =
    "locations" in agent.capabilities.skill.native
      ? {
          locations: agent.capabilities.skill.native.locations,
          scopes: agent.capabilities.skill.native.scopes,
          writerSupported: isCapabilitySupported(agent.capabilities.skill),
        }
      : undefined;

  return {
    id: deriveAgentId(agent),
    name: agent.name,
    rootDir,
    detection,
    ...(skills === undefined ? {} : { skills }),
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

// A type the catalog models no capability for is treated as unsupported.
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

/** Exact native outcomes required by one implementation binding. */
export interface HookDecisionRequirement {
  readonly outcomes?: ReadonlyArray<HookBlockOutcome> | undefined;
  readonly operations?: ReadonlyArray<HookModifyOperation> | undefined;
}

/** Structural contract accepts native bindings without depending on the manifest module. */
export interface HookInstallBinding {
  readonly event: string;
  readonly matcher?: string | undefined;
  readonly handler: { readonly type: string };
  readonly requires?: HookDecisionRequirement | undefined;
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

/** Check exact native semantics; a canonical event never chooses an implementation. */
export const installable = (
  agent: Agent,
  binding: HookInstallBinding,
): HookInstallabilityVerdict => {
  const hook = agent.capabilities.hook;
  if (hook.native.availability.via === "unknown")
    return {
      installable: false,
      reason: `${agent.name}'s hook availability has not been established.`,
    };
  if (hook.native.availability.via === "none" || hook.native.vendorStatus.state === "removed")
    return { installable: false, reason: `${agent.name} has no available native hook system.` };
  if (!("events" in hook.native) || hook.axm.writer === null || hook.native.entryDialect === null)
    return {
      installable: false,
      reason: `AXM has no verified native hook writer for ${agent.name}.`,
    };
  if (binding.handler.type !== "command" || !hook.native.mechanism.includes("command-stdin"))
    return {
      installable: false,
      reason: `${agent.name} cannot project the ${binding.handler.type} handler.`,
    };
  const matches = hook.native.events.filter((event) => event.nativeName === binding.event);
  const event = matches[0];
  if (matches.length !== 1 || event === undefined)
    return {
      installable: false,
      reason: `${agent.name} has no unambiguous native ${binding.event} event.`,
    };
  if (binding.matcher !== undefined && event.matcher.kind === "none-imperative")
    return {
      installable: false,
      reason: `${agent.name} cannot express a matcher for ${binding.event}.`,
    };
  const outcomes = new Set(
    event.decision.flatMap((decision) => (decision.kind === "block" ? decision.outcomes : [])),
  );
  const operations = new Set(
    event.decision.flatMap((decision) => (decision.kind === "modify" ? decision.operations : [])),
  );
  const missingOutcomes = missingValues(binding.requires?.outcomes ?? [], outcomes);
  const missingOperations = missingValues(binding.requires?.operations ?? [], operations);
  if (missingOutcomes.length > 0 || missingOperations.length > 0)
    return {
      installable: false,
      reason: `${agent.name} ${binding.event} cannot preserve required semantics: ${[...missingOutcomes, ...missingOperations].join(", ")}.`,
    };
  return {
    installable: true,
    reason: `${agent.name} can project native ${binding.event}; runtime execution remains unverified.`,
  };
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
    ...(requirement.mechanisms.some((mechanism) => mechanism !== "command-stdin")
      ? ["AXM implements command-stdin hook invocation only"]
      : []),
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
  ...(agent.installTarget === undefined ? {} : { installTarget: agent.installTarget }),
  lifecycle: agent.lifecycle,
  ...(agent.profile === undefined ? {} : { profile: agent.profile }),
  detection: agent.detection,
  docs: agent.docs,
  capabilities: {
    skill: agent.capabilities.skill.native,
    "mcp-server": agent.capabilities["mcp-server"].native,
    subagent: agent.capabilities.subagent.native,
    hook: agent.capabilities.hook.native,
  },
  instructions: agent.instructions.native,
  permissions: agent.permissions.native,
});
