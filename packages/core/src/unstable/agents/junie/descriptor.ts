/**
 * Junie agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Junie agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "junie",
  name: "Junie",
  rootDir: ".junie",
  skills: {
    dir: ".junie/skills",
  },
  commands: {
    dir: ".junie/commands",
  },
  subagents: {
    dir: ".junie/agents",
  },
};
