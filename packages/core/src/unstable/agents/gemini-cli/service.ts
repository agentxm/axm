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
import { addSubagentViaResolve, removeSubagentViaResolve } from "../subagent-sync.js";
import { getHome } from "../constants.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import {
  agentCommandsProjectDir,
  agentSkillsProjectDir,
  agentSubagentsProjectDir,
} from "../descriptor-paths.js";

const GEMINI_DOCS_DEFAULT_DIR = agentSkillsProjectDir("gemini-cli");
const GEMINI_ENV_OVERRIDE = "AXM_GEMINI_CLI_SKILLS_DIR";

/** @experimental */
export const GEMINI_CLI_COMMANDS_PROJECT_DIR = agentCommandsProjectDir("gemini-cli");

/** @experimental */
export const GEMINI_CLI_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("gemini-cli");
/** @experimental */
export const GEMINI_CLI_SUBAGENTS_USER_DIR = ".gemini/agents";

const geminiCommandConfig: CommandSyncConfig = {
  agentId: "gemini-cli",
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
  addMcpServer: (args) => addMcpServerFromManifest("gemini-cli", args),
  removeMcpServer: (args) => removeMcpServerFromManifest("gemini-cli", args),
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
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        const home = yield* getHome;
        return {
          _tag: "supported",
          dir: path.join(home, GEMINI_CLI_SUBAGENTS_USER_DIR),
          warnings: [],
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, GEMINI_CLI_SUBAGENTS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    addSubagentViaResolve(geminiCliCodingAgent.resolveEffectiveSubagentsDir(args), args),
  removeSubagent: (args) =>
    removeSubagentViaResolve(geminiCliCodingAgent.resolveEffectiveSubagentsDir(args), args),
};
