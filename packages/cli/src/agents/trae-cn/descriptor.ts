/**
 * Trae CN agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Trae CN agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "trae-cn",
  name: "Trae CN",
  skills: {
    dir: ".trae/skills",
  },
};
