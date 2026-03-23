/**
 * Uninstall command executor — orchestrates per-command removal pipeline.
 *
 * Pipeline: read lockfile -> remove canonical dir -> remove lockfile/settings entry.
 * Simpler than skills — no agent symlinks.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeCliError } from "../../../cli-error/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../constants.js";

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
 * 2. Remove canonical directory from disk (if exists)
 * 3. Remove lockfile + settings entry
 */
export const uninstallCommand: OperationHandler<
  UninstallCommandOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const lockEntryOption = yield* ws.getLockedCommand(op.args.commandName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "UNINSTALL_COMMAND_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    const lockEntry = Option.getOrUndefined(lockEntryOption);

    // Check if command exists on disk (scan registry extensions dir for any namespace)
    const installedOnDisk = yield* checkInstalledOnDisk(fs, path, base, op.args.commandName);

    if (!lockEntry && !installedOnDisk) {
      return { result: "no-op", message: "not installed" } satisfies OperationResult;
    }

    // Determine canonical path from lock entry or scan
    if (lockEntry?.type === "registry") {
      const canonicalPath = path.join(
        base,
        REGISTRY_EXTENSIONS_DIR,
        lockEntry.namespace,
        "commands",
        lockEntry.name,
      );
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
    } else if (installedOnDisk) {
      // Remove from all known locations
      yield* removeFromAllCommandLocations(fs, path, base, op.args.commandName);
    }

    // Remove from settings + lockfile (swallow errors)
    yield* ws.removeCommand(op.args.commandName).pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Uninstalled ${op.args.commandName}`,
    } satisfies OperationResult;
  });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const checkInstalledOnDisk = (
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

    if (!extensionsDirExists) return false;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        const cmdPath = pathService.join(extensionsDir, scopeDir, "commands", commandName);
        return fsService.exists(cmdPath).pipe(Effect.catch(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });

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

    if (!extensionsDirExists) return;

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
  });
