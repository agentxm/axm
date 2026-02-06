/**
 * Kiro CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Kiro CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "kiro-cli",
  name: "Kiro CLI",
  skills: {
    dir: ".kiro/skills",
  },
};
