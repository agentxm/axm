/**
 * Antigravity agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Antigravity agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "antigravity",
  name: "Antigravity",
  skills: {
    dir: ".agent/skills",
  },
};
