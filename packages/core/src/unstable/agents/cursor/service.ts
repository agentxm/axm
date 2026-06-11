/**
 * Cursor coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { requiredAgentCommandsDir, requiredAgentSubagentsDir } from "../descriptor-paths.js";

/** @experimental */
export const CURSOR_COMMANDS_PROJECT_DIR = requiredAgentCommandsDir("cursor");

/** @experimental */
export const CURSOR_SUBAGENTS_PROJECT_DIR = requiredAgentSubagentsDir("cursor");

export const cursorCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "cursor",
  displayName: "Cursor",
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("cursor", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("cursor", args),
  },
});
