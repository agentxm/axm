/**
 * Kimi Code CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Kimi Code CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "kimi-cli",
  name: "Kimi Code CLI",
  skills: {
    dir: ".agents/skills",
  },
};
