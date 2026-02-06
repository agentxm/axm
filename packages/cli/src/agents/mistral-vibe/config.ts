/**
 * Mistral Vibe agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Mistral Vibe agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "mistral-vibe",
  name: "Mistral Vibe",
  skills: {
    dir: ".vibe/skills",
  },
};
