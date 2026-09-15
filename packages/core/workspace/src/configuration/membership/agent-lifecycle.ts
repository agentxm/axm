/**
 * Whether the vendor still maintains a coding agent, and what a person must
 * be told before AXM configures one it has stopped maintaining.
 *
 * The catalog records the lifecycle; membership policy decides what it means:
 * a retired agent is never configured by detection alone, and configuring one
 * explicitly reports why the vendor stopped maintaining it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  AGENTS_BY_ID,
  AGENT_IDS,
  type AgentId,
  type AgentLifecycle,
} from "@agentxm/extension-model/unstable/agent-capabilities";

const catalogAgentIds = new Set<string>(AGENT_IDS);

/** Narrows a raw id to a catalog agent id. */
export const isCatalogAgentId = (id: string): id is AgentId => catalogAgentIds.has(id);

const ACTIVE: AgentLifecycle = { state: "active" };

/** Lifecycle for a catalog agent; non-catalog ids (e.g. `universal`) are active. */
export const agentLifecycle = (id: string): AgentLifecycle =>
  isCatalogAgentId(id) ? AGENTS_BY_ID[id].lifecycle : ACTIVE;

/** Whether an agent must only be configured through an explicit user choice. */
export const isRetiredAgent = (id: string): boolean => agentLifecycle(id).state === "retired";

/** Warning text for configuring an agent its vendor no longer maintains. */
export const lifecycleWarning = (id: string): string | undefined => {
  if (!isCatalogAgentId(id)) return undefined;
  const name = AGENTS_BY_ID[id].name;
  const lifecycle = agentLifecycle(id);
  if (lifecycle.state === "active") return undefined;
  const since = lifecycle.since === null ? "" : ` since ${lifecycle.since}`;
  const successor =
    lifecycle.supersededBy === null ? "" : ` Superseded by ${lifecycle.supersededBy}.`;
  const note = lifecycle.note === null ? "" : ` ${lifecycle.note}`;
  return `${name} is ${lifecycle.state}${since}.${successor}${note}`;
};
