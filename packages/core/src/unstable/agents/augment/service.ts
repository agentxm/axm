/**
 * Augment coding-agent service implementation.
 *
 * Augment includes cross-tool dedup logic: when a command is already
 * rendered to Claude Code's `.claude/commands/` directory, writing to
 * `.augment/commands/` is skipped (Augment reads Claude Code's commands).
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
  resolveFileExtension,
  type CommandSyncConfig,
} from "../command-sync.js";
import { CLAUDE_CODE_COMMANDS_PROJECT_DIR } from "../claude-code/service.js";
import { isManagedByAxm } from "../../extensions/managed-marker.js";

/** @experimental */
export const AUGMENT_COMMANDS_PROJECT_DIR = ".augment/commands";

const augmentCommandConfig: CommandSyncConfig = {
  agentId: "augment",
};

/**
 * Check whether the command file already exists in Claude Code's commands
 * directory and is managed by axm. If so, Augment can skip writing its own
 * copy since it reads from `.claude/commands/`.
 */
const isRenderedToClaudeCode = (
  workspaceRoot: string,
  commandName: string,
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ext = resolveFileExtension("claude-code");
    const claudePath = path.resolve(
      workspaceRoot,
      CLAUDE_CODE_COMMANDS_PROJECT_DIR,
      `${commandName}${ext}`,
    );
    const exists = yield* fs.exists(claudePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return false;
    const content = yield* fs
      .readFileString(claudePath)
      .pipe(Effect.catch(() => Effect.succeed("")));
    return isManagedByAxm(content);
  });

export const augmentCodingAgent: CodingAgent = {
  id: "augment",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, ".augment/rules"),
      } as const;
    }),
  addMcpServer: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: "MCP add is not supported for augment",
    } as const),
  removeMcpServer: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: "MCP remove is not supported for augment",
    } as const),
  resolveEffectiveCommandsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Augment does not support user-scope commands",
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, AUGMENT_COMMANDS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addCommand: (args) =>
    Effect.gen(function* () {
      // Cross-tool dedup: skip if already rendered to Claude Code
      const alreadyInClaude = yield* isRenderedToClaudeCode(args.workspaceRoot, args.commandName);
      if (alreadyInClaude) {
        yield* Effect.logInfo(
          `Skipping Augment render for "${args.commandName}" — already rendered to .claude/commands/`,
        );
        return {
          _tag: "skipped",
          reason:
            "Command already rendered to Claude Code's .claude/commands/ directory; Augment reads from there",
        } as const;
      }
      return yield* addCommandViaResolve(
        augmentCodingAgent.resolveEffectiveCommandsDir(args),
        args,
        augmentCommandConfig,
      );
    }),
  removeCommand: (args) =>
    removeCommandViaResolve(
      augmentCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      augmentCommandConfig,
    ),
};
