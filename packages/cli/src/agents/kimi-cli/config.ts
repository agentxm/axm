/**
 * Kimi Code CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Kimi Code CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "kimi-cli",
  name: "Kimi Code CLI",
  skills: {
    dir: ".agents/skills",
  },
};
