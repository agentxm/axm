/**
 * Neovate agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Neovate agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "neovate",
  name: "Neovate",
  skills: {
    dir: ".neovate/skills",
  },
};
