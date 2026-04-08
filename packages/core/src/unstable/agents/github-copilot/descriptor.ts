/**
 * GitHub Copilot agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * GitHub Copilot agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "github-copilot",
  name: "GitHub Copilot",
  skills: {
    dir: ".github/skills",
  },
  commands: {
    dir: ".github/prompts",
  },
  subagents: {
    dir: ".github/agents",
  },
};
