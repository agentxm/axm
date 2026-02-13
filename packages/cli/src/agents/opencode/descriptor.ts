/**
 * OpenCode agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * OpenCode agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "opencode",
  name: "OpenCode",
  skills: {
    dir: ".opencode/skills",
  },
};
