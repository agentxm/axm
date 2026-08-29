/**
 * Shared subagent sync helpers for coding-agent service implementations.
 *
 * Provides common logic for writing and removing subagent files in agent
 * subagents directories. Each agent adapter delegates to these helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { insertManagedFileBanner, managedFileFormatForPath } from "../extensions/index.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import {
  renderSubagent,
  buildRooModeEntry,
  mergeRooModes,
  removeRooMode,
} from "../subagents/rendering/index.js";
import type {
  AddSubagentArgs,
  RemoveSubagentArgs,
  ResolveSubagentsDirOutcome,
  SubagentSyncOutcome,
} from "./coding-agent.js";

/** Render the exact managed bytes written by the standard file adapter. */
export const renderManagedSubagentOutputs = (args: AddSubagentArgs) => {
  const rendered = renderSubagent(args.input);
  if (rendered === undefined || rendered._tag === "Skipped") return rendered;
  return {
    ...rendered,
    outputs: rendered.outputs.map((output) => {
      const format = managedFileFormatForPath(output.path);
      return {
        ...output,
        content:
          format === undefined
            ? output.content
            : insertManagedFileBanner(output.content, {
                ...args.managedFile,
                helpTopic: "subagents",
                format,
              }),
      };
    }),
  };
};

/**
 * Parse a .roomodes JSON file into its expected shape.
 * Returns a default empty structure if parsing fails.
 */
const parseRoomodes = (content: string): { customModes: Array<Record<string, unknown>> } => {
  try {
    const raw: unknown = JSON.parse(content);
    if (typeof raw !== "object" || raw === null || !("customModes" in raw)) {
      return { customModes: [] };
    }
    const modes = raw.customModes;
    if (!Array.isArray(modes)) {
      return { customModes: [] };
    }
    return {
      customModes: modes.filter(
        (m): m is Record<string, unknown> => typeof m === "object" && m !== null,
      ),
    };
  } catch {
    return { customModes: [] };
  }
};

const readOptionalSubagentConfig = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(filePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect subagent config: ${filePath}`,
          cause: error,
        }),
      ),
    );
    if (!exists) return "";
    return yield* fs.readFileString(filePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read subagent config: ${filePath}`,
          cause: error,
        }),
      ),
    );
  });

/**
 * Write rendered subagent files to an agent's subagents directory.
 *
 * Handles directory creation and file writing.
 * Returns a `SubagentSyncOutcome` with the rendered file paths and any warnings.
 */
export const writeSubagentFiles = (
  subagentsDir: string,
  args: AddSubagentArgs,
): Effect.Effect<SubagentSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Render using the rendering engine
    const renderResult = renderManagedSubagentOutputs(args);
    if (renderResult === undefined) {
      return {
        _tag: "unsupported",
        reason: `Subagent rendering not supported for ${args.input.agentId}`,
      } as const;
    }
    if (renderResult._tag === "Skipped") {
      return {
        _tag: "skipped",
        reason: renderResult.reason,
      } as const;
    }

    const resolvedOutputs = renderResult.outputs.map((output) => ({
      output,
      filePath: path.resolve(args.workspaceRoot, output.path),
    }));

    // Ensure directory exists and write all files
    yield* fs.makeDirectory(subagentsDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create subagents directory: ${subagentsDir}`,
          cause: error,
        }),
      ),
    );

    const renderedFilePaths: Array<string> = [];
    for (const { output, filePath } of resolvedOutputs) {
      // Ensure parent dir exists (for nested paths)
      const parentDir = path.dirname(filePath);
      yield* protectWorkspacePath(filePath);
      yield* fs.makeDirectory(parentDir, { recursive: true }).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to create directory: ${parentDir}`,
            cause: error,
          }),
        ),
      );

      yield* fs.writeFileString(filePath, output.content).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to write subagent file: ${filePath}`,
            cause: error,
          }),
        ),
      );
      renderedFilePaths.push(filePath);
    }

    return {
      _tag: "success",
      renderedFilePaths,
      warnings: renderResult.warnings.map((w) => `[${w.agent}] ${w.feature}: ${w.message}`),
    } as const;
  });

/**
 * Remove subagent files from an agent's subagents directory.
 *
 * Handles file-not-found gracefully.
 */
export const removeSubagentFiles = (
  args: RemoveSubagentArgs,
): Effect.Effect<SubagentSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const removedPaths: Array<string> = [];
    for (const renderedPath of args.renderedFilePaths) {
      const filePath = path.resolve(args.workspaceRoot, renderedPath);
      const exists = yield* fs.exists(filePath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to inspect subagent file: ${filePath}`,
            cause: error,
          }),
        ),
      );

      if (exists) {
        yield* protectWorkspacePath(filePath);
        yield* fs.remove(filePath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to remove subagent file: ${filePath}`,
              cause: error,
            }),
          ),
        );
      }
      removedPaths.push(filePath);
    }

    return {
      _tag: "success",
      renderedFilePaths: removedPaths,
      warnings: [],
    } as const;
  });

/**
 * Convert a non-supported ResolveSubagentsDirOutcome to a SubagentSyncOutcome.
 */
export const dirOutcomeToSubagentSyncOutcome = (
  outcome: Exclude<ResolveSubagentsDirOutcome, { readonly _tag: "supported" }>,
): SubagentSyncOutcome => ({
  _tag: "unsupported",
  reason: outcome.reason,
});

/**
 * Add a subagent using a resolve function.
 *
 * Common pattern used by most agent adapters.
 */
export const addSubagentViaResolve = (
  resolve: Effect.Effect<ResolveSubagentsDirOutcome, AppError, FileSystem.FileSystem | Path.Path>,
  args: AddSubagentArgs,
): Effect.Effect<SubagentSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirOutcome = yield* resolve;
    if (dirOutcome._tag !== "supported") {
      return dirOutcomeToSubagentSyncOutcome(dirOutcome);
    }
    return yield* writeSubagentFiles(dirOutcome.dir, args);
  });

/**
 * Remove a subagent using a resolve function.
 *
 * Common pattern used by most agent adapters.
 */
export const removeSubagentViaResolve = (
  resolve: Effect.Effect<ResolveSubagentsDirOutcome, AppError, FileSystem.FileSystem | Path.Path>,
  args: RemoveSubagentArgs,
): Effect.Effect<SubagentSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const dirOutcome = yield* resolve;
    if (dirOutcome._tag !== "supported") {
      return dirOutcomeToSubagentSyncOutcome(dirOutcome);
    }
    return yield* removeSubagentFiles(args);
  });

// ---------------------------------------------------------------------------
// Roo Code helpers
// ---------------------------------------------------------------------------

/**
 * Add a subagent as a Roo Code mode entry via read-modify-write.
 *
 * Reads the existing `.roomodes` file, builds a mode entry from the render
 * input, merges it with existing modes, and writes back.
 */
export const addRooSubagent = (
  roomodesPath: string,
  args: AddSubagentArgs,
): Effect.Effect<SubagentSyncOutcome, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Build the Roo mode entry
    const rooResult = buildRooModeEntry(args.input);

    const existingContent = yield* readOptionalSubagentConfig(roomodesPath);

    const existingParsed =
      existingContent.length > 0 ? parseRoomodes(existingContent) : { customModes: [] };

    // Merge and write back
    const existingModes = existingParsed.customModes;
    const mergedModes = mergeRooModes(existingModes, rooResult.entry);

    const newContent = JSON.stringify({ customModes: mergedModes }, null, 2);

    // Ensure parent directory exists
    const path = yield* Path.Path;
    const parentDir = path.dirname(roomodesPath);
    yield* fs.makeDirectory(parentDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create directory: ${parentDir}`,
          cause: error,
        }),
      ),
    );

    yield* protectWorkspacePath(roomodesPath);
    yield* fs.writeFileString(roomodesPath, newContent).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write roomodes file: ${roomodesPath}`,
          cause: error,
        }),
      ),
    );

    return {
      _tag: "success",
      renderedFilePaths: [roomodesPath],
      warnings: rooResult.warnings.map((w) => `[${w.agent}] ${w.feature}: ${w.message}`),
    } as const;
  });

/**
 * Remove a subagent mode entry from a Roo Code modes file.
 */
export const removeRooSubagent = (
  roomodesPath: string,
  subagentName: string,
): Effect.Effect<SubagentSyncOutcome, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const existingContent = yield* readOptionalSubagentConfig(roomodesPath);

    if (existingContent.length === 0) {
      return {
        _tag: "success",
        renderedFilePaths: [roomodesPath],
        warnings: [],
      } as const;
    }

    const parsed = parseRoomodes(existingContent);
    const existingModes = parsed.customModes;
    const filtered = removeRooMode(existingModes, subagentName);

    const newContent = JSON.stringify({ customModes: filtered }, null, 2);

    yield* protectWorkspacePath(roomodesPath);
    yield* fs.writeFileString(roomodesPath, newContent).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write roomodes file: ${roomodesPath}`,
          cause: error,
        }),
      ),
    );

    return {
      _tag: "success",
      renderedFilePaths: [roomodesPath],
      warnings: [],
    } as const;
  });
