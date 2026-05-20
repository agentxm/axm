/**
 * IBM Bob agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * IBM Bob agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "ibm-bob",
  name: "IBM Bob",
  rootDir: ".bob",
  skills: {
    dir: ".bob/skills",
  },
  subagents: {
    dir: ".bob/custom_modes.yaml",
    isFile: true,
  },
  instructions: {
    kind: "agents-md",
  },
};
