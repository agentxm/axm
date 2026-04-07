/**
 * Gemini CLI coding-agent service implementation.
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
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

const GEMINI_DOCS_DEFAULT_DIR = ".gemini/skills";
const GEMINI_ENV_OVERRIDE = "AXM_GEMINI_CLI_SKILLS_DIR";

/** @experimental */
export const GEMINI_CLI_COMMANDS_PROJECT_DIR = ".gemini/commands";

const geminiCommandConfig: CommandSyncConfig = {
  agentId: "gemini-cli",
};

export const geminiCliMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.gemini/mcp.json",
  cliAdd: ["gemini", "mcp", "add", "{serverName}"],
  cliRemove: ["gemini", "mcp", "remove", "{serverName}"],
};

export const geminiCliCodingAgent: CodingAgent = {
  id: "gemini-cli",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const runtimeOverrideOpt = yield* envOption(GEMINI_ENV_OVERRIDE);
      return Option.match(runtimeOverrideOpt, {
        onNone: () =>
          ({
            _tag: "supported",
            dir: path.resolve(workspaceRoot, GEMINI_DOCS_DEFAULT_DIR),
          }) as const,
        onSome: (runtimeOverride) => {
          if (runtimeOverride.trim().length === 0) {
            return {
              _tag: "misconfigured",
              reason: `${GEMINI_ENV_OVERRIDE} is set but empty`,
            } as const;
          }
          return {
            _tag: "supported",
            dir: path.resolve(workspaceRoot, runtimeOverride),
          } as const;
        },
      });
    }),
  addMcpServer: (args) => addMcpServerMixed(geminiCliMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerMixed(geminiCliMcpStrategy, args),
  resolveEffectiveCommandsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Gemini CLI does not support user-scope commands",
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, GEMINI_CLI_COMMANDS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addCommand: (args) =>
    addCommandViaResolve(
      geminiCliCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      geminiCommandConfig,
    ),
  removeCommand: (args) =>
    removeCommandViaResolve(
      geminiCliCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      geminiCommandConfig,
    ),
};
