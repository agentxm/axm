/**
 * Agent registry containing all known AI coding agents.
 *
 * Derives descriptors from the capability catalog. O(1) lookup by agent ID.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Record from "effect/Record";
import { CONFIGURABLE_AGENTS_BY_ID } from "../agent-capabilities/catalog.js";
import { deriveAgentDescriptor } from "../agent-capabilities/derive.js";
import { UNIVERSAL_SKILLS_DIR } from "../extensions/universal-skills-dir.js";
import type { AgentDescriptor, AgentRegistry } from "./types.js";

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
 * Derived descriptors for all known AI coding agents, including the synthetic universal target.
 *
 * Keys are agent IDs, values are full descriptor objects.
 * Paths are pre-expanded at module initialization.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AGENT_DESCRIPTORS: AgentRegistry = {
  ...Record.map(CONFIGURABLE_AGENTS_BY_ID, deriveAgentDescriptor),
  universal: UNIVERSAL_AGENT_DESCRIPTOR,
};
