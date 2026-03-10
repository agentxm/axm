/**
 * Claude Code coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CliEnvConfig } from "../../config/index.js";
import type { CodingAgent } from "../coding-agent.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

const CLAUDE_DOCS_DEFAULT_DIR = ".claude/skills";
const CLAUDE_ENV_OVERRIDE = "AXM_CLAUDE_SKILLS_DIR";

export const claudeCodeMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.claude/mcp.json",
  cliAdd: ["claude", "mcp", "add", "{serverName}"],
  cliRemove: ["claude", "mcp", "remove", "{serverName}"],
};

export const claudeCodeCodingAgent: CodingAgent = {
  id: "claude-code",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const envConfig = yield* CliEnvConfig;
      const runtimeOverride = Option.getOrUndefined(envConfig.claudeSkillsDir);
      if (runtimeOverride !== undefined && runtimeOverride.trim().length === 0) {
        return {
          _tag: "misconfigured",
          reason: `${CLAUDE_ENV_OVERRIDE} is set but empty`,
        } as const;
      }

      const configuredDir = runtimeOverride ?? CLAUDE_DOCS_DEFAULT_DIR;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, configuredDir),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerMixed(claudeCodeMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerMixed(claudeCodeMcpStrategy, args),
};
