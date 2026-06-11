/**
 * Codex coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
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
  agentSkillsDir,
  requiredAgentCommandsDir,
  requiredAgentSubagentsDir,
} from "../descriptor-paths.js";

/** @experimental */
export const CODEX_COMMANDS_USER_DIR = requiredAgentCommandsDir("codex");

/** @experimental */
export const CODEX_SUBAGENTS_PROJECT_DIR = requiredAgentSubagentsDir("codex");
/** @experimental */
export const CODEX_SUBAGENTS_USER_DIR = CODEX_SUBAGENTS_PROJECT_DIR;

const codexCommandConfig: CommandSyncConfig = {
  agentId: "codex",
};

export const codexCodingAgent: CodingAgent = {
  id: "codex",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, agentSkillsDir("codex")),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerFromManifest("codex", args),
  removeMcpServer: (args) => removeMcpServerFromManifest("codex", args),
  resolveEffectiveCommandsDir: ({ scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const home = yield* getHome;
      return {
        _tag: "supported",
        dir: path.join(home, CODEX_COMMANDS_USER_DIR),
        warnings:
          scope === "project"
            ? ["Codex only supports user-scope commands; using ~/.codex/prompts/"]
            : [],
      } as const;
    }),
  addCommand: (args) =>
    addCommandViaResolve(
      codexCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      codexCommandConfig,
    ),
  removeCommand: (args) =>
    removeCommandViaResolve(
      codexCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      codexCommandConfig,
    ),
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        const home = yield* getHome;
        return {
          _tag: "supported",
          dir: path.join(home, CODEX_SUBAGENTS_USER_DIR),
          warnings: [],
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, CODEX_SUBAGENTS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    addSubagentViaResolve(codexCodingAgent.resolveEffectiveSubagentsDir(args), args),
  removeSubagent: (args) =>
    removeSubagentViaResolve(codexCodingAgent.resolveEffectiveSubagentsDir(args), args),
};
