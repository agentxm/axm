/**
 * Pochi agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Pochi agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "pochi",
  name: "Pochi",
  skills: {
    dir: ".pochi/skills",
  },
};
