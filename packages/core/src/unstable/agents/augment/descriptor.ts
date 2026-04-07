/**
 * Augment agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Augment agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "augment",
  name: "Augment",
  skills: {
    dir: ".augment/rules",
  },
  commands: {
    dir: ".augment/commands",
  },
};
