/**
 * Claude Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

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
  commands: {
    dir: ".claude/commands",
  },
  subagents: {
    dir: ".claude/agents",
  },
};
