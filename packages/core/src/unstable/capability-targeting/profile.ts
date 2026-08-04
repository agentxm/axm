/**
 * Capability targeting profiles derived from the verified agent catalog.
 *
 * Availability contributes `native` or `plugin`; spec-tracked surfaces also
 * contribute their standards-compliance grade. Subagents contribute the
 * `permissioned` grade when the agent has a permission surface. Catalog
 * targeting entries add vocabulary that is not represented by extension-type
 * axes, such as structured input and native tool nouns.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { PER_AGENT_EXTENSION_TYPES } from "../extensions/common.js";
import {
  AGENT_IDS as CATALOG_AGENT_IDS,
  agentById,
  type Agent,
  type AgentExtensionCapability,
  type AgentId as CatalogAgentId,
  type LeafExtensionType,
  type PerAgentType,
} from "../agent-capabilities/index.js";
import { isConfigurableAgentId, type AgentId } from "../agents/types.js";
import type { CapabilityRenderTarget } from "./render.js";

/**
 * Targeting vocabulary is plural and independent of extension-type ids:
 * authored manifests say `requires: ["mcp-servers"]`, not `mcp-server`. The
 * `rules` key comes from the agent's `instructions` slot, which is not a
 * per-agent capability.
 */
export const CAPABILITY_KEYS = {
  skill: "skills",
  command: "commands",
  "mcp-server": "mcp-servers",
  subagent: "subagents",
  hook: "hooks",
} as const satisfies Record<PerAgentType, string>;

const capabilityKeys = CAPABILITY_KEYS;

/** Targeting key for the `rule` capability, which lives on `agent.instructions`. */
export const INSTRUCTIONS_CAPABILITY_KEY = "rules";

/**
 * Targeting key for a leaf extension type, or undefined when the vocabulary has
 * no name for it. Distinct from `extensionTypeToPlural`: targeting says
 * `mcp-servers` where the type table says `mcps`.
 */
export const capabilityKeyForType = (type: LeafExtensionType): string | undefined => {
  switch (type) {
    case "rule":
      return INSTRUCTIONS_CAPABILITY_KEY;
    case "files":
      return undefined;
    default:
      return CAPABILITY_KEYS[type];
  }
};

const catalogAgentIds = new Set<string>(CATALOG_AGENT_IDS);
const isCatalogAgentId = (value: string): value is CatalogAgentId => catalogAgentIds.has(value);

type NativeCapability = AgentExtensionCapability["native"];

const capabilityGrades = (
  native: NativeCapability,
  extraGrades: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (native.availability.via === "none") return [];
  const grades = new Set<string>([native.availability.via, ...extraGrades]);
  if ("standardsCompliance" in native && native.standardsCompliance !== "none") {
    grades.add(native.standardsCompliance);
  }
  return Array.from(grades).sort();
};

const capabilityDirectoryToken = (
  capabilityKey: string,
  native: NativeCapability,
): Readonly<Record<string, string>> =>
  "directory" in native ? { [`dir:${capabilityKey}`]: native.directory } : {};

const collectInheritance = (agent: Agent): ReadonlyArray<Agent> => {
  const inherited: Array<Agent> = [];
  const seen = new Set<string>([agent.id]);
  let parentId = agent.targeting?.extends ?? null;
  while (parentId !== null && isCatalogAgentId(parentId)) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = agentById(parentId);
    inherited.push(parent);
    parentId = parent.targeting?.extends ?? null;
  }
  return inherited;
};

const applyCatalogTargeting = (
  agent: Agent,
  capabilities: Record<string, ReadonlyArray<string>>,
  tokens: Record<string, string>,
): void => {
  for (const [key, entry] of Object.entries(agent.targeting?.capabilities ?? {})) {
    const existing = capabilities[key] ?? [];
    capabilities[key] = Array.from(new Set([...existing, ...entry.grades])).sort();
    Object.assign(tokens, entry.nouns, entry.affordances);
  }
};

/** Derive the renderer's pinned target inputs for a catalog agent. */
export const capabilityRenderTargetForAgentId = (agentId: AgentId): CapabilityRenderTarget => {
  if (!isConfigurableAgentId(agentId)) {
    return {
      agentId,
      inheritedAgentIds: [],
      capabilities: {},
      tokens: {},
    };
  }

  const agent = agentById(agentId);
  const inherited = collectInheritance(agent);
  const capabilities: Record<string, ReadonlyArray<string>> = {};
  const tokens: Record<string, string> = {};

  for (const profileAgent of [...inherited].reverse()) {
    applyCatalogTargeting(profileAgent, capabilities, tokens);
  }
  const permissioned = agent.permissions.native.availability.via !== "none";
  for (const type of PER_AGENT_EXTENSION_TYPES) {
    const native = agent.capabilities[type].native;
    const grades = capabilityGrades(
      native,
      type === "subagent" && permissioned ? ["permissioned"] : [],
    );
    if (grades.length > 0) capabilities[capabilityKeys[type]] = grades;
    Object.assign(tokens, capabilityDirectoryToken(capabilityKeys[type], native));
  }
  const instructions = agent.instructions.native;
  const instructionsGrades = capabilityGrades(instructions, []);
  if (instructionsGrades.length > 0) {
    capabilities[INSTRUCTIONS_CAPABILITY_KEY] = instructionsGrades;
  }
  Object.assign(tokens, capabilityDirectoryToken(INSTRUCTIONS_CAPABILITY_KEY, instructions));
  applyCatalogTargeting(agent, capabilities, tokens);

  return {
    agentId,
    inheritedAgentIds: inherited.map((item) => item.id),
    capabilities,
    tokens,
  };
};
