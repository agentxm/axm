/**
 * Codex agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";
import { detect } from "./detection.js";

/**
 * Codex agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "codex",
  name: "Codex",
  skills: {
    dir: ".codex/skills",
  },
  detect,
};
