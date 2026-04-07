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
import { getHome } from "../constants.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

/** @experimental */
export const CODEX_COMMANDS_USER_DIR = ".codex/prompts";

const codexCommandConfig: CommandSyncConfig = {
  agentId: "codex",
};

export const codexMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.codex/mcp.json",
  cliAdd: ["codex", "mcp", "add", "{serverName}"],
  cliRemove: ["codex", "mcp", "remove", "{serverName}"],
};

export const codexCodingAgent: CodingAgent = {
  id: "codex",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, ".codex/skills"),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerMixed(codexMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerMixed(codexMcpStrategy, args),
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
};
