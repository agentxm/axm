/**
 * Cursor coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";

/** @experimental */
export const CURSOR_COMMANDS_PROJECT_DIR = ".cursor/commands";

/** @experimental */
export const CURSOR_SUBAGENTS_PROJECT_DIR = ".cursor/agents";

export const cursorCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "cursor",
  displayName: "Cursor",
  skillsProjectDir: ".cursor/skills",
  commandsProjectDir: CURSOR_COMMANDS_PROJECT_DIR,
  subagentsProjectDir: CURSOR_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("cursor", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("cursor", args),
  },
});
