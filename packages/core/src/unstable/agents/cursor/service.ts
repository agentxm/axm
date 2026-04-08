/**
 * Cursor coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

/** @experimental */
export const CURSOR_COMMANDS_PROJECT_DIR = ".cursor/commands";

/** @experimental */
export const CURSOR_SUBAGENTS_PROJECT_DIR = ".cursor/agents";

export const cursorMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.cursor/mcp.json",
  cliAdd: ["cursor", "mcp", "add", "{serverName}"],
  cliRemove: ["cursor", "mcp", "remove", "{serverName}"],
};

export const cursorCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "cursor",
  displayName: "Cursor",
  skillsProjectDir: ".cursor/skills",
  commandsProjectDir: CURSOR_COMMANDS_PROJECT_DIR,
  subagentsProjectDir: CURSOR_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerMixed(cursorMcpStrategy, args),
    removeMcpServer: (args) => removeMcpServerMixed(cursorMcpStrategy, args),
  },
});
