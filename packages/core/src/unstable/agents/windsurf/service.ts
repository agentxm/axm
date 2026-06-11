/**
 * Windsurf coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import {
  agentCommandsProjectDir,
  agentSkillsProjectDir,
  agentSubagentsProjectDirOptional,
} from "../descriptor-paths.js";

/** @experimental */
export const WINDSURF_COMMANDS_PROJECT_DIR = agentCommandsProjectDir("windsurf");

const windsurfSubagentsProjectDir = agentSubagentsProjectDirOptional("windsurf");

export const windsurfCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "windsurf",
  displayName: "Windsurf",
  skillsProjectDir: agentSkillsProjectDir("windsurf"),
  commandsProjectDir: WINDSURF_COMMANDS_PROJECT_DIR,
  ...(windsurfSubagentsProjectDir === undefined
    ? {}
    : { subagentsProjectDir: windsurfSubagentsProjectDir }),
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("windsurf", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("windsurf", args),
  },
});
