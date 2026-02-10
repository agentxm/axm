/**
 * Claude Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";
import { detect } from "./detection.js";

/**
 * Claude Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "claude-code",
  name: "Claude Code",
  skills: {
    dir: ".claude/skills",
  },
  detect,
};
