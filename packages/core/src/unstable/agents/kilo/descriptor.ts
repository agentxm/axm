/**
 * Kilo Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Kilo Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "kilo",
  name: "Kilo Code",
  rootDir: ".kilocode",
  skills: {
    dir: ".kilocode/skills",
  },
  commands: {
    dir: ".kilo/commands",
  },
  subagents: {
    dir: ".kilo/agents",
  },
};
