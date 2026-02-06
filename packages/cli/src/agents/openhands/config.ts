/**
 * OpenHands agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * OpenHands agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "openhands",
  name: "OpenHands",
  skills: {
    dir: ".openhands/skills",
  },
};
