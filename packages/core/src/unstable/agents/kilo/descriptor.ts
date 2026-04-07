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
  skills: {
    dir: ".kilocode/skills",
  },
  commands: {
    dir: ".kilo/commands",
  },
};
