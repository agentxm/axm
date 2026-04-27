/**
 * Mistral Vibe agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Mistral Vibe agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "mistral-vibe",
  name: "Mistral Vibe",
  rootDir: ".vibe",
  skills: {
    dir: ".vibe/skills",
  },
};
