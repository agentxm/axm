/**
 * OpenCode coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";
import {
  addMcpServerConfigFirst,
  type ConfigFirstStrategy,
  removeMcpServerConfigFirst,
} from "../mcp-sync.js";

/** @experimental */
export const OPENCODE_COMMANDS_PROJECT_DIR = ".opencode/commands";

/** @experimental */
export const OPENCODE_SUBAGENTS_PROJECT_DIR = ".opencode/agents";

export const opencodeMcpStrategy: ConfigFirstStrategy = {
  configPath: "{workspaceRoot}/.opencode/mcp.json",
  verifyCommand: ["opencode", "mcp", "list"],
};

export const opencodeCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "opencode",
  displayName: "OpenCode",
  skillsProjectDir: ".opencode/skills",
  commandsProjectDir: OPENCODE_COMMANDS_PROJECT_DIR,
  subagentsProjectDir: OPENCODE_SUBAGENTS_PROJECT_DIR,
  mcp: {
    addMcpServer: (args) => addMcpServerConfigFirst(opencodeMcpStrategy, args),
    removeMcpServer: (args) => removeMcpServerConfigFirst(opencodeMcpStrategy, args),
  },
});
