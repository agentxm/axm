/**
 * OpenClaw agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * OpenClaw agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "openclaw",
  name: "OpenClaw",
  skills: {
    dir: "skills",
  },
};
