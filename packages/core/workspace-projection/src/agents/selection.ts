/**
 * Which agents a workspace projects onto, decided from the configured agent
 * IDs alone.
 *
 * Every function here is pure over the IDs settings declares, so planning,
 * facts, and reporting share one decision instead of each re-reading settings.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { codingAgentForId, type CodingAgent } from "@agentxm/agent-integration";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { AGENT_IDS, isConfigurableAgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";

/** The agent every workspace projects onto, whatever it configures. */
export const UNIVERSAL_AGENT_ID = "universal" as const;

export const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

/** Every adapter AXM ships, in catalog order. */
export const allCodingAgents = (): ReadonlyArray<CodingAgent> =>
  AGENT_IDS.map((id) => codingAgentForId(id));

/**
 * The configured agents AXM can project onto: known, configurable, in the
 * order the workspace declared them. Unknown and non-configurable IDs are
 * reported separately rather than silently dropped.
 */
export const configuredCodingAgents = (
  configuredAgentIds: ReadonlyArray<string>,
): ReadonlyArray<CodingAgent> =>
  configuredAgentIds
    .filter((id) => isKnownAgentId(id) && isConfigurableAgentId(id))
    .map((id) => codingAgentForId(id));

/** The universal agent followed by every configured agent. */
export const materializationCodingAgents = (
  configuredAgentIds: ReadonlyArray<string>,
): ReadonlyArray<CodingAgent> => [
  codingAgentForId(UNIVERSAL_AGENT_ID),
  ...configuredCodingAgents(configuredAgentIds),
];

/** Configured IDs this AXM build does not recognise. */
export const unknownConfiguredAgentIds = (
  configuredAgentIds: ReadonlyArray<string>,
): ReadonlyArray<string> => configuredAgentIds.filter((id) => !isKnownAgentId(id));
