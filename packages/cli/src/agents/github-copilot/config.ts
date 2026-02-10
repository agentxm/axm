/**
 * GitHub Copilot agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * GitHub Copilot agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "github-copilot",
  name: "GitHub Copilot",
  skills: {
    dir: ".github/skills",
  },
};
