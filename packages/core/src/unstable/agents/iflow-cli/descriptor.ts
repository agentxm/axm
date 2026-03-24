/**
 * iFlow CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * iFlow CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "iflow-cli",
  name: "iFlow CLI",
  skills: {
    dir: ".iflow/skills",
  },
};
