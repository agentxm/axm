/**
 * GitHub Copilot CLI coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";

/** @experimental */
export const GITHUB_COPILOT_SUBAGENTS_PROJECT_DIR = ".github/agents";

export const githubCopilotCliCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "github-copilot-cli",
  displayName: "GitHub Copilot CLI",
  skillsProjectDir: ".github/skills",
  subagentsProjectDir: GITHUB_COPILOT_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerFromManifest("github-copilot-cli", args),
    removeMcpServer: (args) => removeMcpServerFromManifest("github-copilot-cli", args),
  },
});
