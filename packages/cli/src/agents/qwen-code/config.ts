/**
 * Qwen Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Qwen Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "qwen-code",
  name: "Qwen Code",
  skills: {
    dir: ".qwen/skills",
  },
};
