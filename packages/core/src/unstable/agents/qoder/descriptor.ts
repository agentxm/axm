/**
 * Qoder agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Qoder agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "qoder",
  name: "Qoder",
  rootDir: ".qoder",
  skills: {
    dir: ".qoder/skills",
  },
};
