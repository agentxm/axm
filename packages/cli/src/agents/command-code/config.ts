/**
 * Command Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Command Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "command-code",
  name: "Command Code",
  skills: {
    dir: ".commandcode/skills",
  },
};
