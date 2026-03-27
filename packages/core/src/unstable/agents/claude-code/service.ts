/**
 * Claude Code coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { envOption } from "../../utils/index.js";
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
      const runtimeOverrideOpt = yield* envOption(CLAUDE_ENV_OVERRIDE);
      const runtimeOverride = Option.getOrUndefined(runtimeOverrideOpt);
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
