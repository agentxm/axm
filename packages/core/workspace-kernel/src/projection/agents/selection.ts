/**
 * Which agents a workspace projects onto, decided from the configured agent
 * IDs alone.
 *
 * Every function here is pure over the IDs settings declares, so planning,
 * facts, and reporting share one decision instead of each re-reading settings.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { NativeDirectoryInputs } from "../../locations/index.js";
import { codingAgentForId, type CodingAgent } from "../../agent-adapters/index.js";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import {
  MATERIALIZATION_TARGET_IDS,
  type MaterializationTargetId,
} from "@agentxm/extension-model/unstable/agents/types";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";

export const isKnownAgentId = (id: string): id is MaterializationTargetId =>
  Object.hasOwn(AGENT_DESCRIPTORS, id);

/** Every adapter AXM ships, in catalog order. */
export const allCodingAgents = (
  inputs: NativeDirectoryInputs = { skillsDirectoryOverrides: {} },
): ReadonlyArray<CodingAgent> =>
  MATERIALIZATION_TARGET_IDS.map((id) => codingAgentForId(id, inputs));

/**
 * The configured agents AXM can project onto: known, configurable, in the
 * order the workspace declared them. Unknown and non-configurable IDs are
 * reported separately rather than silently dropped.
 */
export const configuredCodingAgents = (
  configuredAgentIds: ReadonlyArray<string>,
  inputs: NativeDirectoryInputs = { skillsDirectoryOverrides: {} },
): ReadonlyArray<CodingAgent> =>
  configuredAgentIds
    .filter((id) => isKnownAgentId(id) && isConfigurableAgentId(id))
    .map((id) => codingAgentForId(id, inputs));

/** Materialization adapters are the configured real agents; shared locations are policy. */
export const materializationCodingAgents = (
  configuredAgentIds: ReadonlyArray<string>,
  inputs: NativeDirectoryInputs = { skillsDirectoryOverrides: {} },
): ReadonlyArray<CodingAgent> => configuredCodingAgents(configuredAgentIds, inputs);

/** Configured IDs this AXM build does not recognise. */
export const unknownConfiguredAgentIds = (
  configuredAgentIds: ReadonlyArray<string>,
): ReadonlyArray<string> => configuredAgentIds.filter((id) => !isKnownAgentId(id));
