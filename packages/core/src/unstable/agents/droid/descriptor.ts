/**
 * Droid agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Droid agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "droid",
  name: "Droid",
  rootDir: ".factory",
  skills: {
    dir: ".factory/skills",
  },
};
