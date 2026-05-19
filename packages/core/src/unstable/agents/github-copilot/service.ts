/**
 * GitHub Copilot coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";

/** @experimental */
export const GITHUB_COPILOT_COMMANDS_PROJECT_DIR = ".github/prompts";

/** @experimental */
export const GITHUB_COPILOT_SUBAGENTS_PROJECT_DIR = ".github/agents";

export const githubCopilotCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "github-copilot",
  displayName: "GitHub Copilot",
  skillsProjectDir: ".github/skills",
  commandsProjectDir: GITHUB_COPILOT_COMMANDS_PROJECT_DIR,
  subagentsProjectDir: GITHUB_COPILOT_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("github-copilot", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("github-copilot", args),
  },
});
