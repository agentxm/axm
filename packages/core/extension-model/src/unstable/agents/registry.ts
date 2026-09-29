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
import type { AgentRegistry } from "./types.js";

/**
 * Derived descriptors for all known configurable coding agents.
 *
 * Keys are agent IDs, values are full descriptor objects.
 * Paths are pre-expanded at module initialization.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AGENT_DESCRIPTORS: AgentRegistry = {
  ...Record.map(CONFIGURABLE_AGENTS_BY_ID, deriveAgentDescriptor),
};
