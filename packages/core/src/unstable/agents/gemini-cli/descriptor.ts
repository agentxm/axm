/**
 * Gemini CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Gemini CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "gemini-cli",
  name: "Gemini CLI",
  rootDir: ".gemini",
  skills: {
    dir: ".gemini/skills",
  },
  commands: {
    dir: ".gemini/commands",
  },
  subagents: {
    dir: ".gemini/agents",
  },
  instructions: {
    kind: "own-file",
    file: "GEMINI.md",
  },
};
