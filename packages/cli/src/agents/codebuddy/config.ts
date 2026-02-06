/**
 * CodeBuddy agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * CodeBuddy agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "codebuddy",
  name: "CodeBuddy",
  skills: {
    dir: ".codebuddy/skills",
  },
};
