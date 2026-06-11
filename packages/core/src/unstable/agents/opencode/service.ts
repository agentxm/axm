/**
 * OpenCode coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import {
  agentCommandsProjectDir,
  agentSkillsProjectDir,
  agentSubagentsProjectDir,
} from "../descriptor-paths.js";

/** @experimental */
export const OPENCODE_COMMANDS_PROJECT_DIR = agentCommandsProjectDir("opencode");

/** @experimental */
export const OPENCODE_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("opencode");

export const opencodeCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "opencode",
  displayName: "OpenCode",
  skillsProjectDir: agentSkillsProjectDir("opencode"),
  commandsProjectDir: OPENCODE_COMMANDS_PROJECT_DIR,
  subagentsProjectDir: OPENCODE_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("opencode", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("opencode", args),
  },
});
