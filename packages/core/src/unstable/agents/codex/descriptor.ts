/**
 * Codex agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Codex agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "codex",
  name: "Codex",
  rootDir: ".codex",
  skills: {
    dir: ".codex/skills",
  },
  commands: {
    dir: ".codex/prompts",
  },
  subagents: {
    dir: ".codex/agents",
  },
  instructions: {
    kind: "agents-md",
  },
};
