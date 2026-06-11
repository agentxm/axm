/**
 * Kilo Code coding-agent service implementation.
 *
 * Kilo Code resolves between `.opencode/commands/` and `.kilo/commands/`
 * based on which directory exists. Falls back to `.kilo/commands/` if
 * neither exists.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import {
  addCommandViaResolve,
  removeCommandViaResolve,
  type CommandSyncConfig,
} from "../command-sync.js";
import { addSubagentViaResolve, removeSubagentViaResolve } from "../subagent-sync.js";
import { agentSkillsProjectDir, agentSubagentsProjectDir } from "../descriptor-paths.js";

/** @experimental */
export const KILO_COMMANDS_OPENCODE_DIR = ".opencode/commands";
/** @experimental */
export const KILO_COMMANDS_FALLBACK_DIR = ".kilo/commands";

/** @experimental */
export const KILO_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("kilo");

const kiloCommandConfig: CommandSyncConfig = {
  agentId: "kilo",
};

const resolveKiloCommandsDir = (
  workspaceRoot: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const opencodeDir = path.resolve(workspaceRoot, KILO_COMMANDS_OPENCODE_DIR);
    const opencodeExists = yield* fs
      .exists(opencodeDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (opencodeExists) {
      return opencodeDir;
    }

    return path.resolve(workspaceRoot, KILO_COMMANDS_FALLBACK_DIR);
  });

export const kiloCodingAgent: CodingAgent = {
  id: "kilo",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, agentSkillsProjectDir("kilo")),
      } as const;
    }),
  addMcpServer: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: "MCP add is not supported for kilo",
    } as const),
  removeMcpServer: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: "MCP remove is not supported for kilo",
    } as const),
  resolveEffectiveCommandsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Kilo Code does not support user-scope commands",
        } as const;
      }
      const dir = yield* resolveKiloCommandsDir(workspaceRoot);
      return {
        _tag: "supported",
        dir,
        warnings: [],
      } as const;
    }),
  addCommand: (args) =>
    addCommandViaResolve(
      kiloCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      kiloCommandConfig,
    ),
  removeCommand: (args) =>
    removeCommandViaResolve(
      kiloCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      kiloCommandConfig,
    ),
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Kilo Code does not support user-scope subagents",
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, KILO_SUBAGENTS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    addSubagentViaResolve(kiloCodingAgent.resolveEffectiveSubagentsDir(args), args),
  removeSubagent: (args) =>
    removeSubagentViaResolve(kiloCodingAgent.resolveEffectiveSubagentsDir(args), args),
};
