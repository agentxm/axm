/**
 * Shared command sync helpers for coding-agent service implementations.
 *
 * Provides common logic for writing and removing command files in agent
 * commands directories. Each agent adapter delegates to these helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { selectRenderer, type CommandRenderOutcome } from "../commands/renderers/index.js";
import type {
  AddCommandArgs,
  CommandSyncOutcome,
  RemoveCommandArgs,
  ResolveCommandsDirOutcome,
} from "./coding-agent.js";

/**
 * Configuration for an agent's command sync behavior.
 */
export interface CommandSyncConfig {
  /** The agent ID used to select the appropriate renderer. */
  readonly agentId: string;
}

const defaultCommandSyncConfig: CommandSyncConfig = {
  agentId: "claude-code",
};

const emptyFrontmatter: Readonly<Record<string, unknown>> = {};

/**
 * Render command content using the format-family renderer for the given agent.
 */
const renderCommand = (args: AddCommandArgs, agentId: string): CommandRenderOutcome | undefined => {
  const renderer = selectRenderer(agentId);
  if (renderer === undefined) return undefined;
  const frontmatter = Option.getOrElse(args.frontmatter, () => emptyFrontmatter);
  return renderer({
    frontmatter,
    body: args.body,
    agentId,
    commandName: args.commandName,
    agentOverrides: Option.getOrUndefined(args.agentOverrides),
  });
};

const unsupportedCommandOutcome = (agentId: string): CommandSyncOutcome => ({
  _tag: "unsupported",
  reason: `Command rendering not supported for ${agentId}`,
});

/**
 * Write a command file to an agent's commands directory.
 *
 * Handles directory creation and file writing.
 * Returns a `CommandSyncOutcome` with the rendered file path and any warnings.
 */
export const writeCommandFile = (
  commandsDir: string,
  args: AddCommandArgs,
  config: CommandSyncConfig = defaultCommandSyncConfig,
): Effect.Effect<CommandSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Render content using the format-family renderer for this agent
    const renderResult = renderCommand(args, config.agentId);
    if (renderResult === undefined) return unsupportedCommandOutcome(config.agentId);
    if (renderResult._tag === "Skipped") {
      return {
        _tag: "unsupported",
        reason: renderResult.reason,
      } as const;
    }

    const output = renderResult.outputs[0];
    if (output === undefined) return unsupportedCommandOutcome(config.agentId);
    const filePath = path.join(commandsDir, output.relativePath);

    // Ensure directory exists
    const parentDir = path.dirname(filePath);
    yield* fs.makeDirectory(parentDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "COMMAND_SYNC_WRITE_FAILED",
          category: "internal",
          message: `Failed to create commands directory: ${parentDir}`,
          cause: error,
        }),
      ),
    );

    // Write the file
    yield* fs.writeFileString(filePath, output.content).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "COMMAND_SYNC_WRITE_FAILED",
          category: "internal",
          message: `Failed to write command file: ${filePath}`,
          cause: error,
        }),
      ),
    );

    return {
      _tag: "success",
      renderedFilePath: filePath,
      warnings: renderResult.warnings.map((w) => `[${w.agent}] ${w.feature}: ${w.message}`),
    } as const;
  });

/**
 * Resolve the renderer-owned relative path for a command.
 */
export const resolveCommandRelativePath = (
  agentId: string,
  commandName: string,
): string | undefined => {
  const renderer = selectRenderer(agentId);
  if (renderer === undefined) return undefined;
  const output = renderer({
    frontmatter: emptyFrontmatter,
    body: "",
    agentId,
    commandName,
    agentOverrides: undefined,
  });
  if (output._tag === "Skipped") return undefined;
  return output.outputs[0]?.relativePath;
};

/**
 * Remove a command file from an agent's commands directory.
 *
 * Handles file-not-found gracefully.
 */
export const removeCommandFile = (
  commandsDir: string,
  args: RemoveCommandArgs,
  config: CommandSyncConfig = defaultCommandSyncConfig,
): Effect.Effect<CommandSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const relativePath = resolveCommandRelativePath(config.agentId, args.commandName);
    if (relativePath === undefined) return unsupportedCommandOutcome(config.agentId);
    const filePath = path.join(commandsDir, relativePath);

    const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) {
      return {
        _tag: "success",
        renderedFilePath: filePath,
        warnings: [],
      } as const;
    }

    yield* fs.remove(filePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "COMMAND_SYNC_REMOVE_FAILED",
          category: "internal",
          message: `Failed to remove command file: ${filePath}`,
          cause: error,
        }),
      ),
    );

    return {
      _tag: "success",
      renderedFilePath: filePath,
      warnings: [],
    } as const;
  });

/**
 * Convert a non-supported ResolveCommandsDirOutcome to a CommandSyncOutcome.
 *
 * Intentionally maps "disabled" and "misconfigured" to "unsupported" —
 * callers of CommandSync don't need to distinguish these cases today.
 */
export const dirOutcomeToSyncOutcome = (
  outcome: Exclude<ResolveCommandsDirOutcome, { readonly _tag: "supported" }>,
): CommandSyncOutcome => ({
  _tag: "unsupported",
  reason: outcome.reason,
});

/**
 * Add a command using a resolve function and optional config.
 *
 * Common pattern used by most agent adapters.
 */
export const addCommandViaResolve = (
  resolve: Effect.Effect<ResolveCommandsDirOutcome, AppError, FileSystem.FileSystem | Path.Path>,
  args: AddCommandArgs,
  config: CommandSyncConfig = defaultCommandSyncConfig,
): Effect.Effect<CommandSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirOutcome = yield* resolve;
    if (dirOutcome._tag !== "supported") {
      return dirOutcomeToSyncOutcome(dirOutcome);
    }
    return yield* writeCommandFile(dirOutcome.dir, args, config);
  });

/**
 * Remove a command using a resolve function and optional config.
 *
 * Common pattern used by most agent adapters.
 */
export const removeCommandViaResolve = (
  resolve: Effect.Effect<ResolveCommandsDirOutcome, AppError, FileSystem.FileSystem | Path.Path>,
  args: RemoveCommandArgs,
  config: CommandSyncConfig = defaultCommandSyncConfig,
): Effect.Effect<CommandSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirOutcome = yield* resolve;
    if (dirOutcome._tag !== "supported") {
      return dirOutcomeToSyncOutcome(dirOutcome);
    }
    return yield* removeCommandFile(dirOutcome.dir, args, config);
  });
