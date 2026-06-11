/**
 * Windsurf coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { requiredAgentCommandsDir } from "../descriptor-paths.js";

/** @experimental */
export const WINDSURF_COMMANDS_PROJECT_DIR = requiredAgentCommandsDir("windsurf");

/** @experimental */
export const WINDSURF_SUBAGENTS_PROJECT_DIR = ".windsurf/agents";

export const windsurfCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "windsurf",
  displayName: "Windsurf",
  subagentsProjectDir: WINDSURF_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("windsurf", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("windsurf", args),
  },
});
