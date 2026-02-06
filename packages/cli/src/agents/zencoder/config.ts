/**
 * Zencoder agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Zencoder agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "zencoder",
  name: "Zencoder",
  skills: {
    dir: ".zencoder/skills",
  },
};
