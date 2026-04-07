/**
 * Kiro CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Kiro CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "kiro-cli",
  name: "Kiro CLI",
  skills: {
    dir: ".kiro/skills",
  },
  commands: {
    dir: ".kiro/prompts",
  },
};
