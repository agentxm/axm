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
import {
  addCommandViaResolve,
  removeCommandViaResolve,
  type CommandSyncConfig,
} from "../command-sync.js";
import { getHome } from "../constants.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

const CLAUDE_DOCS_DEFAULT_DIR = ".claude/skills";
const CLAUDE_ENV_OVERRIDE = "AXM_CLAUDE_SKILLS_DIR";

/** @experimental */
export const CLAUDE_CODE_COMMANDS_PROJECT_DIR = ".claude/commands";
/** @experimental */
export const CLAUDE_CODE_COMMANDS_USER_DIR = ".claude/commands";

const claudeCodeCommandConfig: CommandSyncConfig = {
  agentId: "claude-code",
};

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
      return Option.match(runtimeOverrideOpt, {
        onNone: () =>
          ({
            _tag: "supported",
            dir: path.resolve(workspaceRoot, CLAUDE_DOCS_DEFAULT_DIR),
          }) as const,
        onSome: (runtimeOverride) => {
          if (runtimeOverride.trim().length === 0) {
            return {
              _tag: "misconfigured",
              reason: `${CLAUDE_ENV_OVERRIDE} is set but empty`,
            } as const;
          }
          return {
            _tag: "supported",
            dir: path.resolve(workspaceRoot, runtimeOverride),
          } as const;
        },
      });
    }),
  addMcpServer: (args) => addMcpServerMixed(claudeCodeMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerMixed(claudeCodeMcpStrategy, args),
  resolveEffectiveCommandsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        const home = yield* getHome;
        return {
          _tag: "supported",
          dir: path.join(home, CLAUDE_CODE_COMMANDS_USER_DIR),
          warnings: [],
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, CLAUDE_CODE_COMMANDS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addCommand: (args) =>
    addCommandViaResolve(
      claudeCodeCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      claudeCodeCommandConfig,
    ),
  removeCommand: (args) =>
    removeCommandViaResolve(
      claudeCodeCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      claudeCodeCommandConfig,
    ),
};
