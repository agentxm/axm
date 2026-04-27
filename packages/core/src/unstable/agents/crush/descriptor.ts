/**
 * Crush agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Crush agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "crush",
  name: "Crush",
  rootDir: ".crush",
  skills: {
    dir: ".crush/skills",
  },
};
