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

import {
  AGENT_IDS as CATALOG_AGENT_IDS,
  agentById,
  type Agent,
  type AgentId as CatalogAgentId,
} from "../agent-capabilities/index.js";
import { isConfigurableAgentId, type AgentId } from "../agents/types.js";
import type { CapabilityRenderTarget } from "./render.js";

const capabilityKeys = {
  skill: "skills",
  command: "commands",
  "mcp-server": "mcp-servers",
  subagent: "subagents",
  files: "files",
  rule: "rules",
  hook: "hooks",
} as const;

const catalogAgentIds = new Set<string>(CATALOG_AGENT_IDS);
const isCatalogAgentId = (value: string): value is CatalogAgentId => catalogAgentIds.has(value);

const extensionCapabilityGrades = (
  agent: Agent,
  type: keyof typeof capabilityKeys,
): ReadonlyArray<string> => {
  const native = agent.capabilities[type].native;
  if (native.availability.via === "none") return [];
  const grades = new Set<string>([native.availability.via]);
  if ("standardsCompliance" in native && native.standardsCompliance !== "none") {
    grades.add(native.standardsCompliance);
  }
  if (type === "subagent" && agent.permissions.native.availability.via !== "none") {
    grades.add("permissioned");
  }
  return Array.from(grades).sort();
};

const extensionCapabilityTokens = (
  agent: Agent,
  type: keyof typeof capabilityKeys,
): Readonly<Record<string, string>> => {
  const native = agent.capabilities[type].native;
  if (!("directory" in native)) return {};
  return { [`dir:${capabilityKeys[type]}`]: native.directory };
};

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
  for (const type of Object.keys(capabilityKeys)) {
    if (
      type === "skill" ||
      type === "command" ||
      type === "mcp-server" ||
      type === "subagent" ||
      type === "files" ||
      type === "rule" ||
      type === "hook"
    ) {
      const grades = extensionCapabilityGrades(agent, type);
      if (grades.length > 0) capabilities[capabilityKeys[type]] = grades;
      Object.assign(tokens, extensionCapabilityTokens(agent, type));
    }
  }
  applyCatalogTargeting(agent, capabilities, tokens);

  return {
    agentId,
    inheritedAgentIds: inherited.map((item) => item.id),
    capabilities,
    tokens,
  };
};
