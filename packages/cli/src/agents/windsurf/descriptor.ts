/**
 * Windsurf agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Windsurf agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "windsurf",
  name: "Windsurf",
  skills: {
    dir: ".windsurf/skills",
  },
};
