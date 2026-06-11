/**
 * Junie coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { requiredAgentCommandsDir, requiredAgentSubagentsDir } from "../descriptor-paths.js";

/** @experimental */
export const JUNIE_COMMANDS_PROJECT_DIR = requiredAgentCommandsDir("junie");

/** @experimental */
export const JUNIE_SUBAGENTS_PROJECT_DIR = requiredAgentSubagentsDir("junie");

export const junieCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "junie",
  displayName: "Junie",
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("junie", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("junie", args),
  },
});
