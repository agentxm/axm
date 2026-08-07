/**
 * Junie coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { agentSkillsProjectDir, agentSubagentsProjectDir } from "../descriptor-paths.js";

/** @experimental */
export const JUNIE_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("junie");

export const junieCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "junie",
  displayName: "Junie",
  skillsProjectDir: agentSkillsProjectDir("junie"),
  subagentsProjectDir: JUNIE_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("junie", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("junie", args),
  },
});
