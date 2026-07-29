/**
 * Agent lifecycle lookups for the `axm agents` command tree.
 *
 * The catalog records whether a coding agent product is still active; the CLI
 * had no surface for it, so a retired agent looked identical to a maintained
 * one in `axm agents list` and configured silently in `axm agents add`.
 */

import {
  AGENTS_BY_ID,
  AGENT_IDS,
  type AgentId,
  type AgentLifecycle,
} from "@agentxm/client-core/unstable/agent-capabilities";

const catalogAgentIds = new Set<string>(AGENT_IDS);

/** Narrows a raw id to a catalog agent id. */
export const isCatalogAgentId = (id: string): id is AgentId => catalogAgentIds.has(id);

const ACTIVE: AgentLifecycle = { state: "active" };

/** Lifecycle for a catalog agent; non-catalog ids (e.g. `universal`) are active. */
export const agentLifecycle = (id: string): AgentLifecycle =>
  isCatalogAgentId(id) ? AGENTS_BY_ID[id].lifecycle : ACTIVE;

/** Table cell for the lifecycle column. Active agents render blank, not "active". */
export const lifecycleCell = (id: string): string => {
  const lifecycle = agentLifecycle(id);
  if (lifecycle.state === "active") return "";
  return lifecycle.supersededBy === null
    ? lifecycle.state
    : `${lifecycle.state} -> ${lifecycle.supersededBy}`;
};

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
