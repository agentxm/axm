/**
 * Replit agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Replit agent descriptor.
 *
 * Note: Replit does not support global installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "replit",
  name: "Replit",
  skills: {
    dir: ".agents/skills",
  },
};
