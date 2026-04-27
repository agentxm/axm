/**
 * Pi agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Pi agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "pi",
  name: "Pi",
  rootDir: ".pi",
  skills: {
    dir: ".pi/skills",
  },
};
