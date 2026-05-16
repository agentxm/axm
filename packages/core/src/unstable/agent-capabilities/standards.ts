/**
 * Standards referenced by the agent capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { Standard } from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export const STANDARDS = {
  skills: {
    id: "agent-skills",
    name: "Agent Skills",
    url: "https://agentskills.io",
  },
  mcp: {
    id: "mcp",
    name: "Model Context Protocol",
    url: "https://modelcontextprotocol.io",
  },
  instructions: {
    id: "agents-md",
    name: "AGENTS.md",
    url: "https://agents.md",
  },
} as const satisfies Record<string, Standard>;
