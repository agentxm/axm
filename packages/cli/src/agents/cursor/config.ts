/**
 * Cursor agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";
import { detect } from "./detection.js";

/**
 * Cursor agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "cursor",
  name: "Cursor",
  skills: {
    dir: ".cursor/skills",
  },
  detect,
};
