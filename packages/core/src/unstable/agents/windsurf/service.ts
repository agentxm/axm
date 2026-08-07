/**
 * Windsurf coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { agentSkillsProjectDir, agentSubagentsProjectDirOptional } from "../descriptor-paths.js";

const windsurfSubagentsProjectDir = agentSubagentsProjectDirOptional("windsurf");

export const windsurfCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "windsurf",
  displayName: "Windsurf",
  skillsProjectDir: agentSkillsProjectDir("windsurf"),
  ...(windsurfSubagentsProjectDir === undefined
    ? {}
    : { subagentsProjectDir: windsurfSubagentsProjectDir }),
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("windsurf", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("windsurf", args),
  },
});
