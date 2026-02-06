/**
 * Replit agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Replit agent configuration.
 *
 * Note: Replit does not support global installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "replit",
  name: "Replit",
  skills: {
    dir: ".agents/skills",
  },
};
