/**
 * Open standards referenced by the extension type catalog.
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
  rules: {
    id: "agents-md",
    name: "AGENTS.md",
    url: "https://agents.md",
  },
  okf: {
    id: "okf-0.2",
    name: "Open Knowledge Format 0.2",
    url: "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md",
  },
} as const satisfies Record<string, Standard>;
