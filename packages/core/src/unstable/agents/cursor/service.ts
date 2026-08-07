/**
 * Cursor coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { agentSkillsProjectDir, agentSubagentsProjectDir } from "../descriptor-paths.js";

/** @experimental */
export const CURSOR_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("cursor");

export const cursorCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "cursor",
  displayName: "Cursor",
  skillsProjectDir: agentSkillsProjectDir("cursor"),
  subagentsProjectDir: CURSOR_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("cursor", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("cursor", args),
  },
});
