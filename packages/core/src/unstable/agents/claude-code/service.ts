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
import { addSubagentViaResolve, removeSubagentViaResolve } from "../subagent-sync.js";
import { getHome } from "../constants.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import {
  agentCommandsProjectDir,
  agentSkillsProjectDir,
  agentSubagentsProjectDir,
} from "../descriptor-paths.js";

const CLAUDE_DOCS_DEFAULT_DIR = agentSkillsProjectDir("claude-code");
const CLAUDE_ENV_OVERRIDE = "AXM_CLAUDE_SKILLS_DIR";

/** @experimental */
export const CLAUDE_CODE_COMMANDS_PROJECT_DIR = agentCommandsProjectDir("claude-code");
/** @experimental */
export const CLAUDE_CODE_COMMANDS_USER_DIR = ".claude/commands";

/** @experimental */
export const CLAUDE_CODE_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("claude-code");
/** @experimental */
export const CLAUDE_CODE_SUBAGENTS_USER_DIR = ".claude/agents";

const claudeCodeCommandConfig: CommandSyncConfig = {
  agentId: "claude-code",
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
  addMcpServer: (args) => addMcpServerFromManifest("claude-code", args),
  removeMcpServer: (args) => removeMcpServerFromManifest("claude-code", args),
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
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        const home = yield* getHome;
        return {
          _tag: "supported",
          dir: path.join(home, CLAUDE_CODE_SUBAGENTS_USER_DIR),
          warnings: [],
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, CLAUDE_CODE_SUBAGENTS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    addSubagentViaResolve(claudeCodeCodingAgent.resolveEffectiveSubagentsDir(args), args),
  removeSubagent: (args) =>
    removeSubagentViaResolve(claudeCodeCodingAgent.resolveEffectiveSubagentsDir(args), args),
};
