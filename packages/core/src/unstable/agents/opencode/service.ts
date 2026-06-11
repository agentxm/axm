/**
 * OpenCode coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { requiredAgentCommandsDir, requiredAgentSubagentsDir } from "../descriptor-paths.js";

/** @experimental */
export const OPENCODE_COMMANDS_PROJECT_DIR = requiredAgentCommandsDir("opencode");

/** @experimental */
export const OPENCODE_SUBAGENTS_PROJECT_DIR = requiredAgentSubagentsDir("opencode");

export const opencodeCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "opencode",
  displayName: "OpenCode",
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("opencode", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("opencode", args),
  },
});
