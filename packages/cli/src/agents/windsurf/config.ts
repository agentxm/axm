/**
 * Windsurf agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";
import { detect } from "./detection.js";

/**
 * Windsurf agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "windsurf",
  name: "Windsurf",
  skills: {
    dir: ".windsurf/skills",
  },
  detect,
};
