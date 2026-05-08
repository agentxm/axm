/**
 * Uninstall extension pack operation handler.
 *
 * Removes extension pack directory from disk and extension pack entry from settings/lockfile.
 * Skill removal is delegated to uninstall-skill operations in the plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/index.js";
import { computeExtensionPackPaths } from "../paths.js";
import { removeIfExists } from "../../utils/index.js";
import { sanitizeName } from "../../extensions/utils.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the uninstall extension pack operation.
 */
export interface UninstallExtensionPackOperationArgs {
  /** Pack name to uninstall */
  readonly packName: string;
}

/**
 * Remove an extension pack from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallExtensionPackOperation = Operation<
  "uninstall-pack",
  UninstallExtensionPackOperationArgs
>;

/**
 * Uninstall extension pack operation handler.
 *
 * 1. Look up extension pack in lockfile
 * 2. Remove extension pack directory from disk
 * 3. Remove extension extension pack from settings and lockfile
 */
export const uninstallExtensionPack: OperationHandler<
  UninstallExtensionPackOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CliRenderer
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const renderer = yield* CliRenderer;
    const base = ws.baseDir;

    // Read pack lock entry
    const lockedPackOpt = yield* ws.getLockedExtensionPack(op.args.packName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "UNINSTALL_PACK_LOCKFILE_READ_FAILED",
          category: "internal",
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
            message: "Removed extension pack directory from disk",
          } satisfies JobStepResult;
        }
      }

      return { result: "success", message: "not installed" } satisfies JobStepResult;
    }

    const lockedPack = lockedPackOpt.value;

    // Remove extension pack directory from disk
    const packDir = computeExtensionPackPaths(
      path.join,
      base,
      lockedPack.owner,
      lockedPack.name,
    ).canonicalPath;
    yield* removeIfExists(fs, packDir);

    // Remove extension extension pack from settings and lockfile
    yield* ws
      .removeExtensionPack(op.args.packName)
      .pipe(
        Effect.catch((e) =>
          renderer.warn(`Extension pack removal from settings failed: ${String(e)}`),
        ),
      );

    return {
      result: "success",
      message: `Uninstalled extension pack ${op.args.packName}`,
    } satisfies JobStepResult;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        result: "error",
        message: `Failed to uninstall extension pack: ${error.what}`,
        error,
      } satisfies JobStepResult),
    ),
  );
