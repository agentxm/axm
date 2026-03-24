/**
 * Qwen Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Qwen Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "qwen-code",
  name: "Qwen Code",
  skills: {
    dir: ".qwen/skills",
  },
};
