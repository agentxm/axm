/**
 * Continue agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Continue agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "continue",
  name: "Continue",
  rootDir: ".continue",
  skills: {
    dir: ".continue/skills",
  },
};
