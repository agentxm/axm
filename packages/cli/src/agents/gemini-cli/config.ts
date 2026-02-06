/**
 * Gemini CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Gemini CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "gemini-cli",
  name: "Gemini CLI",
  skills: {
    dir: ".gemini/skills",
  },
};
