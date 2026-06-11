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
import * as Option from "effect/Option";
import type { CodingAgent } from "../coding-agent.js";
import {
  addCommandViaResolve,
  removeCommandViaResolve,
  resolveCommandRelativePath,
  type CommandSyncConfig,
} from "../command-sync.js";
import { addSubagentViaResolve, removeSubagentViaResolve } from "../subagent-sync.js";
import { CLAUDE_CODE_COMMANDS_PROJECT_DIR } from "../claude-code/service.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { selectRenderer } from "../../commands/renderers/index.js";
import { insertManagedFileBanner, managedFileFormatForPath } from "../../extensions/index.js";
import {
  agentCommandsProjectDir,
  agentSkillsProjectDir,
  agentSubagentsProjectDir,
} from "../descriptor-paths.js";

/** @experimental */
export const AUGMENT_COMMANDS_PROJECT_DIR = agentCommandsProjectDir("augment");

/** @experimental */
export const AUGMENT_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("augment");

const augmentCommandConfig: CommandSyncConfig = {
  agentId: "augment",
};

const emptyFrontmatter: Readonly<Record<string, unknown>> = {};

/**
 * Check whether the command file already exists in Claude Code's commands
 * directory with the exact content AXM would render there. If so, Augment can
 * skip writing its own copy since it reads from `.claude/commands/`.
 */
const isRenderedToClaudeCode = (
  args: Parameters<CodingAgent["addCommand"]>[0],
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const relativePath = resolveCommandRelativePath("claude-code", args.commandName);
    if (relativePath === undefined) return false;
    const claudePath = path.resolve(
      args.workspaceRoot,
      CLAUDE_CODE_COMMANDS_PROJECT_DIR,
      relativePath,
    );
    const exists = yield* fs.exists(claudePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return false;
    const content = yield* fs
      .readFileString(claudePath)
      .pipe(Effect.catch(() => Effect.succeed("")));
    const renderer = selectRenderer("claude-code");
    if (renderer === undefined) return false;
    const expected = renderer({
      frontmatter: Option.getOrElse(args.frontmatter, () => emptyFrontmatter),
      body: args.body,
      agentId: "claude-code",
      commandName: args.commandName,
      agentOverrides: Option.getOrUndefined(args.agentOverrides),
    });
    if (expected._tag === "Skipped") return false;
    const output = expected.outputs[0];
    if (output === undefined) return false;
    const format = managedFileFormatForPath(output.relativePath);
    const expectedContent =
      format === undefined
        ? output.content
        : insertManagedFileBanner(output.content, {
            editPath: args.editSourcePath,
            helpTopic: "commands",
            format,
          });
    return content === expectedContent;
  });

export const augmentCodingAgent: CodingAgent = {
  id: "augment",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, agentSkillsProjectDir("augment")),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerFromManifest("augment", args),
  removeMcpServer: (args) => removeMcpServerFromManifest("augment", args),
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
      const alreadyInClaude = yield* isRenderedToClaudeCode(args);
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
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Augment does not support user-scope subagents",
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, AUGMENT_SUBAGENTS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    addSubagentViaResolve(augmentCodingAgent.resolveEffectiveSubagentsDir(args), args),
  removeSubagent: (args) =>
    removeSubagentViaResolve(augmentCodingAgent.resolveEffectiveSubagentsDir(args), args),
};
