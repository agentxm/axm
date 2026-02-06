/**
 * Trae CN agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Trae CN agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "trae-cn",
  name: "Trae CN",
  skills: {
    dir: ".trae/skills",
  },
};
