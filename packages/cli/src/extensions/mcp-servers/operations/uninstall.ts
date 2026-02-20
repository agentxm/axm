/**
 * Uninstall MCP server executor — orchestrates per-server removal pipeline.
 *
 * Pipeline: read lockfile -> remove canonical dir -> remove lockfile/settings entry.
 * Simpler than skills — no agent symlinks.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../constants.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the uninstall-mcp-server operation.
 */
export interface UninstallMcpServerOperationArgs {
  readonly serverName: string;
}

/**
 * Remove an MCP server from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallMcpServerOperation = Operation<
  "uninstall-mcp-server",
  UninstallMcpServerOperationArgs
>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Uninstall-mcp-server operation handler.
 *
 * 1. Read lockfile to determine if server is installed
 * 2. Remove canonical directory from disk (if exists)
 * 3. Remove lockfile + settings entry
 */
export const uninstallMcpServer: OperationHandler<
  UninstallMcpServerOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const lockEntryOption = yield* ws.getLockedMcpServer(op.args.serverName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "UNINSTALL_MCP_SERVER_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    const lockEntry = Option.getOrUndefined(lockEntryOption);

    // Check if server exists on disk (scan registry extensions dir for any namespace)
    const installedOnDisk = yield* checkInstalledOnDisk(fs, path, base, op.args.serverName);

    if (!lockEntry && !installedOnDisk) {
      return { result: "no-op", message: "not installed" } satisfies OperationResult;
    }

    // Determine canonical path from lock entry or scan
    if (lockEntry?.type === "registry") {
      const canonicalPath = path.join(
        base,
        REGISTRY_EXTENSIONS_DIR,
        lockEntry.namespace,
        "mcp-servers",
        lockEntry.name,
      );
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));
    } else if (installedOnDisk) {
      // Remove from all known locations
      yield* removeFromAllMcpServerLocations(fs, path, base, op.args.serverName);
    }

    // Remove from settings + lockfile (swallow errors)
    yield* ws.removeMcpServer(op.args.serverName).pipe(Effect.catchAll(() => Effect.void));

    return {
      result: "success",
      message: `Uninstalled ${op.args.serverName}`,
    } satisfies OperationResult;
  });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  base: string,
  serverName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!extensionsDirExists) return false;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        const serverPath = pathService.join(extensionsDir, scopeDir, "mcp-servers", serverName);
        return fsService.exists(serverPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });

const removeFromAllMcpServerLocations = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  base: string,
  serverName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!extensionsDirExists) return;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

    yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.void;
        const serverPath = pathService.join(extensionsDir, scopeDir, "mcp-servers", serverName);
        return fsService
          .remove(serverPath, { recursive: true })
          .pipe(Effect.catchAll(() => Effect.void));
      },
      { concurrency: "unbounded" },
    );
  });
