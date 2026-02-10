/**
 * Continue agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";
import { detect } from "./detection.js";

/**
 * Continue agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "continue",
  name: "Continue",
  skills: {
    dir: ".continue/skills",
  },
  detect,
};
