/**
 * Grok CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Grok CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "grok-cli",
  name: "Grok CLI",
  rootDir: ".grok",
  skills: {
    dir: ".grok/skills",
  },
};
