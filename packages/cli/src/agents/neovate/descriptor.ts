/**
 * Neovate agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Neovate agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "neovate",
  name: "Neovate",
  skills: {
    dir: ".neovate/skills",
  },
};
