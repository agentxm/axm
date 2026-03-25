/**
 * Uninstall-pack operation handler.
 *
 * Removes pack directory from disk and pack entry from settings/lockfile.
 * Skill removal is delegated to uninstall-skill operations in the plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "@axm.sh/core/unstable/extensions";
import { computePackPaths } from "../paths.js";
import { removeIfExists } from "@axm.sh/core/unstable/utils";
import { sanitizeName } from "../../skills/utils.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the uninstall-pack operation.
 */
export interface UninstallPackOperationArgs {
  /** Pack name to uninstall */
  readonly packName: string;
}

/**
 * Remove a pack from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallPackOperation = Operation<"uninstall-pack", UninstallPackOperationArgs>;

/**
 * Uninstall-pack operation handler.
 *
 * 1. Look up pack in lockfile
 * 2. Remove pack directory from disk
 * 3. Remove pack from settings and lockfile
 */
export const uninstallPack: OperationHandler<
  UninstallPackOperation,
  FileSystem.FileSystem | Path.Path | Workspace | Output
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const output = yield* Output;
    const base = ws.baseDir;

    // Read pack lock entry
    const lockedPackOpt = yield* ws.getLockedPack(op.args.packName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "UNINSTALL_PACK_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(lockedPackOpt)) {
      // Scan for orphaned pack folders on disk
      const extensionsDir = path.join(base, REGISTRY_EXTENSIONS_DIR);
      const extensionsDirExists = yield* fs
        .exists(extensionsDir)
        .pipe(Effect.catch(() => Effect.succeed(false)));

      if (extensionsDirExists) {
        const namespaceDirs = yield* fs
          .readDirectory(extensionsDir)
          .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

        const sanitized = sanitizeName(op.args.packName);

        const results = yield* Effect.forEach(
          namespaceDirs,
          (nsDir) => {
            if (!nsDir.startsWith("@")) return Effect.succeed(false);
            const packDir = path.join(extensionsDir, nsDir, "packs", sanitized);
            return fs.exists(packDir).pipe(
              Effect.catch(() => Effect.succeed(false)),
              Effect.flatMap((exists) => {
                if (!exists) return Effect.succeed(false);
                return removeIfExists(fs, packDir).pipe(Effect.map(() => true));
              }),
            );
          },
          { concurrency: "unbounded" },
        );

        if (results.some((removed) => removed)) {
          return {
            result: "success",
            message: "Removed pack directory from disk",
          } satisfies OperationResult;
        }
      }

      return { result: "no-op", message: "not installed" } satisfies OperationResult;
    }

    const lockedPack = lockedPackOpt.value;

    // Remove pack directory from disk
    const packDir = computePackPaths(
      path.join,
      base,
      lockedPack.profile,
      lockedPack.name,
    ).canonicalPath;
    yield* removeIfExists(fs, packDir);

    // Remove pack from settings and lockfile
    yield* ws
      .removePack(op.args.packName)
      .pipe(Effect.catch((e) => output.warn(`Pack removal from settings failed: ${String(e)}`)));

    return {
      result: "success",
      message: `Uninstalled pack ${op.args.packName}`,
    } satisfies OperationResult;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        result: "error",
        message: `Failed to uninstall pack: ${error.what}`,
        error,
      } satisfies OperationResult),
    ),
  );
