/**
 * Mux agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Mux agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "mux",
  name: "Mux",
  rootDir: ".mux",
  skills: {
    dir: ".mux/skills",
  },
};
