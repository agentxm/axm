/**
 * OpenCode agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";
import { detect } from "./detection.js";

/**
 * OpenCode agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "opencode",
  name: "OpenCode",
  skills: {
    dir: ".opencode/skills",
  },
  detect,
};
