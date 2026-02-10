/**
 * Antigravity agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Antigravity agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "antigravity",
  name: "Antigravity",
  skills: {
    dir: ".agent/skills",
  },
};
