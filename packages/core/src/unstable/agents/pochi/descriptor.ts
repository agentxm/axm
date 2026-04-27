/**
 * Pochi agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Pochi agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "pochi",
  name: "Pochi",
  rootDir: ".pochi",
  skills: {
    dir: ".pochi/skills",
  },
};
