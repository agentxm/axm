/**
 * Claude Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";
import { detect } from "./detection.js";

/**
 * Claude Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "claude-code",
  name: "Claude Code",
  skills: {
    dir: ".claude/skills",
  },
  detect,
};
