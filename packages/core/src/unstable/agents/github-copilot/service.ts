/**
 * GitHub Copilot coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

/** @experimental */
export const GITHUB_COPILOT_COMMANDS_PROJECT_DIR = ".github/prompts";

/** @experimental */
export const GITHUB_COPILOT_SUBAGENTS_PROJECT_DIR = ".github/agents";

export const githubCopilotMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.github/mcp.json",
  cliAdd: ["gh", "copilot", "mcp", "add", "{serverName}"],
  cliRemove: ["gh", "copilot", "mcp", "remove", "{serverName}"],
};

export const githubCopilotCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "github-copilot",
  displayName: "GitHub Copilot",
  skillsProjectDir: ".github/skills",
  commandsProjectDir: GITHUB_COPILOT_COMMANDS_PROJECT_DIR,
  subagentsProjectDir: GITHUB_COPILOT_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerMixed(githubCopilotMcpStrategy, args),
    removeMcpServer: (args) => removeMcpServerMixed(githubCopilotMcpStrategy, args),
  },
});
