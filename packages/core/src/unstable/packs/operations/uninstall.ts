/**
 * Uninstall pack operation handler.
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
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepArtifact, JobStepArtifactTarget, JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/index.js";
import { computePackPaths } from "../paths.js";
import { removeIfExists } from "../../utils/index.js";
import { sanitizeName } from "../../extensions/utils.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the uninstall pack operation.
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

const packDirectoryArtifact = (args: {
  readonly owner: string;
  readonly name: string;
  readonly version?: string;
}): JobStepArtifact => {
  const target = removedPackDirectoryTarget(args.owner, args.name);
  return {
    path: target.path,
    scope: "project",
    change: "removed",
    ...(args.version === undefined ? {} : { version: args.version }),
    targets: [target],
  };
};

const removedPackDirectoryTarget = (owner: string, name: string): JobStepArtifactTarget => ({
  path: `${REGISTRY_EXTENSIONS_DIR}/${owner}/packs/${name}`,
  change: "removed",
});

/**
 * Uninstall pack operation handler.
 *
 * 1. Look up pack in lockfile
 * 2. Remove pack directory from disk
 * 3. Remove pack from settings and lockfile
 */
export const uninstallPack: OperationHandler<
  UninstallPackOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;

    // Read pack lock entry
    const lockedPackOpt = yield* ws.getLockedPack(op.args.packName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read lockfile: ${e.message}`,
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

        // Report only the namespaces whose pack directory was actually removed,
        // not every "@" namespace present on disk.
        const removedNamespaces = namespaceDirs.filter((_, index) => results[index] === true);
        if (removedNamespaces.length > 0) {
          const targets = removedNamespaces.map((nsDir) =>
            removedPackDirectoryTarget(nsDir, sanitized),
          );
          return {
            result: "success",
            message: "Removed pack directory from disk",
            artifact: {
              path: targets[0]?.path ?? `${REGISTRY_EXTENSIONS_DIR}/*/packs/${sanitized}`,
              scope: "project",
              change: "removed",
              targets,
            },
          } satisfies JobStepResult;
        }
      }

      return { result: "success", message: "not installed" } satisfies JobStepResult;
    }

    const lockedPack = lockedPackOpt.value;

    // Remove pack directory from disk
    const packDir = computePackPaths(
      path.join,
      base,
      lockedPack.owner,
      lockedPack.name,
    ).canonicalPath;
    yield* removeIfExists(fs, packDir);

    // Remove pack from settings and lockfile
    const metadataWarning = yield* ws.removePack(op.args.packName).pipe(
      Effect.as(undefined),
      Effect.catch((e) => Effect.succeed(`Pack removal from settings failed: ${String(e)}`)),
    );

    return {
      result: "success",
      message:
        metadataWarning === undefined
          ? `Uninstalled pack ${op.args.packName}`
          : `Uninstalled pack ${op.args.packName}; ${metadataWarning}`,
      artifact: packDirectoryArtifact({
        owner: lockedPack.owner,
        name: lockedPack.name,
        version: lockedPack.type === "workspace" ? lockedPack.version : lockedPack.resolvedVersion,
      }),
    } satisfies JobStepResult;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        result: "error",
        message: `Failed to uninstall pack: ${error.message}`,
        error,
      } satisfies JobStepResult),
    ),
  );
