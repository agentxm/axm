/**
 * Kilo Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Kilo Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "kilo",
  name: "Kilo Code",
  skills: {
    dir: ".kilocode/skills",
  },
};
