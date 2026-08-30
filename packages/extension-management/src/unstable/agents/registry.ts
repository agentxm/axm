/**
 * Agent registry containing all known AI coding agents.
 *
 * Derives descriptors from the capability catalog. O(1) lookup by agent ID.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Record from "effect/Record";
import { CONFIGURABLE_AGENTS_BY_ID } from "@agentxm/extension-model/unstable/agent-capabilities/catalog";
import { deriveAgentDescriptor } from "@agentxm/extension-model/unstable/agent-capabilities/derive";
import { UNIVERSAL_SKILLS_DIR } from "../extensions/universal-skills-dir.js";
import {
  AGENT_IDS,
  type AgentDescriptor,
  type AgentId,
  type AgentRegistry,
} from "@agentxm/extension-model/unstable/agents/types";

const UNIVERSAL_AGENT_DESCRIPTOR: AgentDescriptor = {
  id: "universal",
  name: "Universal",
  rootDir: undefined,
  skills: {
    dir: UNIVERSAL_SKILLS_DIR,
    additionalReadPaths: [],
  },
  detection: { project: { markers: [] }, user: { markers: [] } },
};

/**
 * Complete registry of all known AI coding agents.
 *
 * Keys are agent IDs, values are full descriptor objects.
 * Paths are pre-expanded at module initialization.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AGENTS: AgentRegistry = {
  ...Record.map(CONFIGURABLE_AGENTS_BY_ID, deriveAgentDescriptor),
  universal: UNIVERSAL_AGENT_DESCRIPTOR,
};

/**
 * Get all registered agent IDs.
 *
 * @returns Array of all agent identifiers
 *
 * @example
 * ```typescript
 * const ids = getAgentIds();
 * // ["adal", "amp", "antigravity", "augment", "claude-code", ...]
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getAgentIds = (): ReadonlyArray<AgentId> => AGENT_IDS;
