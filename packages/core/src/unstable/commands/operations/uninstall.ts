/**
 * Uninstall command executor — orchestrates per-command removal pipeline.
 *
 * Pipeline: read lockfile -> remove rendered files from agents -> remove
 * canonical dir -> remove lockfile/settings entry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR, EXTERNAL_EXTENSIONS_DIR } from "../../extensions/index.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { checkInstalledOnDisk } from "./shared-command-helpers.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the uninstall-command operation.
 */
export interface UninstallCommandOperationArgs {
  readonly commandName: string;
}

/**
 * Remove a command from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallCommandOperation = Operation<
  "uninstall-command",
  UninstallCommandOperationArgs
>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Uninstall-command operation handler.
 *
 * 1. Read lockfile to determine if command is installed
 * 2. Remove rendered files from agents (using renderedFiles from lockfile)
 * 3. Remove canonical directory from disk (if exists)
 * 4. Remove lockfile + settings entry
 */
export const uninstallCommand: (
  op: UninstallCommandOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | Workspace | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const agentRepo = yield* CodingAgentRepository;
    const base = ws.baseDir;

    const lockEntryOption = yield* ws.getLockedCommand(op.args.commandName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "UNINSTALL_COMMAND_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    const lockEntry = Option.getOrUndefined(lockEntryOption);

    // Check if command exists on disk (scan registry extensions dir for any owner)
    const installedOnDisk = yield* checkInstalledOnDisk(fs, path, base, op.args.commandName);

    if (!lockEntry && !installedOnDisk) {
      return { result: "success", message: "not installed" } satisfies JobStepResult;
    }

    // --- Remove rendered files from agents ---
    if (lockEntry?.renderedFiles) {
      const renderedFiles = lockEntry.renderedFiles;
      yield* Effect.forEach(
        Object.entries(renderedFiles),
        ([_agentId, files]) =>
          Effect.forEach(
            files,
            (file) =>
              fs.remove(file.path, { recursive: true }).pipe(Effect.catch(() => Effect.void)),
            { concurrency: "unbounded" },
          ),
        { concurrency: "unbounded" },
      );
    } else if (lockEntry?.agents && lockEntry.agents.length > 0) {
      // Fallback: remove via agent removeCommand
      const configuredAgents = yield* agentRepo.getConfiguredAgents();

      yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent
            .removeCommand({
              workspaceRoot: base,
              scope: "project",
              commandName: op.args.commandName,
            })
            .pipe(Effect.catch(() => Effect.void)),
        { concurrency: "unbounded" },
      );
    }

    // --- Remove canonical directory ---
    if (lockEntry?.type === "registry") {
      const canonicalPath = path.join(
        base,
        REGISTRY_EXTENSIONS_DIR,
        lockEntry.owner,
        "commands",
        lockEntry.name,
      );
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
    } else if (installedOnDisk) {
      // Remove from all known locations
      yield* removeFromAllCommandLocations(fs, path, base, op.args.commandName);
    }

    // Remove from external extensions dir too
    const externalPath = path.join(base, EXTERNAL_EXTENSIONS_DIR, "commands", op.args.commandName);
    yield* fs.remove(externalPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));

    // Remove from settings + lockfile (swallow errors)
    yield* ws.removeCommand(op.args.commandName).pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Uninstalled ${op.args.commandName}`,
    } satisfies JobStepResult;
  });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const removeFromAllCommandLocations = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  base: string,
  commandName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (extensionsDirExists) {
      const scopeDirs = yield* fsService
        .readDirectory(extensionsDir)
        .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

      yield* Effect.forEach(
        scopeDirs,
        (scopeDir) => {
          if (!scopeDir.startsWith("@")) return Effect.void;
          const cmdPath = pathService.join(extensionsDir, scopeDir, "commands", commandName);
          return fsService
            .remove(cmdPath, { recursive: true })
            .pipe(Effect.catch(() => Effect.void));
        },
        { concurrency: "unbounded" },
      );
    }

    // Also remove from external
    const externalPath = pathService.join(base, EXTERNAL_EXTENSIONS_DIR, "commands", commandName);
    yield* fsService
      .remove(externalPath, { recursive: true })
      .pipe(Effect.catch(() => Effect.void));
  });
