/**
 * Zencoder agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Zencoder agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "zencoder",
  name: "Zencoder",
  rootDir: ".zencoder",
  skills: {
    dir: ".zencoder/skills",
  },
};
