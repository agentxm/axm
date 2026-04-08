/**
 * Roo Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Roo Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "roo",
  name: "Roo Code",
  skills: {
    dir: ".roo/skills",
  },
  commands: {
    dir: ".roo/commands",
  },
  subagents: {
    dir: ".roomodes",
    isFile: true,
  },
};
