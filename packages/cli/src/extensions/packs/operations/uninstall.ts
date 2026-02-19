/**
 * Uninstall-pack operation handler.
 *
 * Removes pack from settings, lockfile, and disk. Orphaned extensions
 * (those no longer referenced by any remaining pack or direct settings entry)
 * are also cleaned up.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { Log } from "../../../tui/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../constants.js";
import { parseFqn } from "../../index.js";
import { computePackPaths } from "../paths.js";
import { removeIfExists } from "../../../utils/fs-helpers.js";
import { sanitizeName } from "../../skills/utils.js";
import { findOrphanedSkills } from "./orphan-detection.js";

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
 * 3. Detect orphaned skills and remove them
 * 4. Remove pack from settings and lockfile
 */
export const uninstallPack: OperationHandler<
  UninstallPackOperation,
  FileSystem.FileSystem | Path.Path | Workspace | Log
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const log = yield* Log;
    const base = ws.baseDir;

    // Read pack lock entry
    const lockedPackOpt = yield* ws.getLockedPack(op.args.packName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "UNINSTALL_PACK_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(lockedPackOpt)) {
      return { result: "no-op", message: "not installed" } satisfies OperationResult;
    }

    const lockedPack = lockedPackOpt.value;

    // Remove pack directory from disk
    const packDir = computePackPaths(
      path.join,
      base,
      lockedPack.namespace,
      lockedPack.name,
    ).canonicalPath;
    yield* removeIfExists(fs, packDir);

    // Detect orphaned skills
    const lockedPacks = yield* ws.getLockedPacks();
    const { [op.args.packName]: _, ...remainingPacks } = lockedPacks;
    void _;

    const configuredSkillsNormalized = yield* ws.getConfiguredSkills();
    // findOrphanedSkills checks key presence (`fqn in configuredSkills`).
    // resolvedSkills keys are 3-segment FQNs (e.g. @namespace/skills/name) while
    // configured skills use simple names (e.g. name). Include both forms so
    // the orphan check matches regardless of format.
    const simpleKeys = Object.keys(configuredSkillsNormalized);
    const configuredSkillKeys: Record<string, string> = Object.fromEntries(
      simpleKeys.map((k) => [k, ""]),
    );
    // Map FQN keys from the removed pack's resolvedSkills back to simple names
    // so direct entries (keyed by simple name) prevent orphan removal
    for (const fqnKey of Object.keys(lockedPack.resolvedSkills)) {
      const parsed = yield* parseFqn(fqnKey).pipe(Effect.option);
      if (Option.isSome(parsed) && parsed.value.name in configuredSkillsNormalized) {
        configuredSkillKeys[fqnKey] = "";
      }
    }
    const orphanedSkills = findOrphanedSkills(lockedPack, remainingPacks, configuredSkillKeys);

    // Remove orphaned skills from disk and settings/lockfile
    yield* Effect.forEach(
      orphanedSkills,
      (skillFqn) =>
        Effect.gen(function* () {
          const extensionsDir = path.join(base, REGISTRY_EXTENSIONS_DIR);

          // Parse 3-segment FQN to locate the skill on disk; fall back to scanning namespace dirs
          yield* parseFqn(skillFqn).pipe(
            Effect.flatMap((parsed) => {
              const skillPath = path.join(
                extensionsDir,
                parsed.namespace,
                parsed.type,
                sanitizeName(parsed.name),
              );
              return removeIfExists(fs, skillPath);
            }),
            Effect.catchAll(() => {
              // Fallback: scan namespace dirs for legacy 2-segment FQNs
              const sanitized = sanitizeName(skillFqn);
              return fs.exists(extensionsDir).pipe(
                Effect.catchAll(() => Effect.succeed(false)),
                Effect.flatMap((exists) => {
                  if (!exists) return Effect.void;
                  return fs.readDirectory(extensionsDir).pipe(
                    Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])),
                    Effect.flatMap((scopeDirs) =>
                      Effect.forEach(
                        scopeDirs,
                        (scopeDir) => {
                          if (!scopeDir.startsWith("@")) return Effect.void;
                          const skillPath = path.join(extensionsDir, scopeDir, "skills", sanitized);
                          return removeIfExists(fs, skillPath);
                        },
                        { concurrency: "unbounded" },
                      ),
                    ),
                  );
                }),
              );
            }),
          );

          // Remove from settings + lockfile
          yield* ws.removeSkill(skillFqn).pipe(Effect.catchAll(() => Effect.void));
          yield* log.info(`Removed orphaned skill: ${skillFqn}`);
        }),
      { concurrency: 1 },
    );

    // Remove pack from settings and lockfile
    yield* ws
      .removePack(op.args.packName)
      .pipe(Effect.catchAll((e) => log.warn(`Pack removal from settings failed: ${String(e)}`)));

    return {
      result: "success",
      message: `Uninstalled pack ${op.args.packName}`,
    } satisfies OperationResult;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({
        result: "error",
        message: `Failed to uninstall pack: ${error.what}`,
      } satisfies OperationResult),
    ),
  );
