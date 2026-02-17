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
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import type { UninstallPackOperation } from "../operations.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../../extensions/constants.js";
import { removeIfExists } from "../../skills/fs-helpers.js";
import { sanitizeName } from "../../skills/install/skill-utils.js";
import { findOrphanedSkills } from "./build-plan.js";

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
    const base = path.dirname(ws.path);

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
    const packDir = path.join(
      base,
      REGISTRY_EXTENSIONS_DIR,
      lockedPack.scope,
      "packs",
      lockedPack.name,
    );
    yield* removeIfExists(fs, packDir);

    // Detect orphaned skills
    const lockedPacks = yield* ws.getLockedPacks();
    const { [op.args.packName]: _, ...remainingPacks } = lockedPacks;
    void _;

    const configuredSkillsNormalized = yield* ws.getConfiguredSkills();
    // findOrphanedSkills only checks key presence (`fqn in configuredSkills`),
    // so we build a minimal SkillsMap-shaped record from the normalized keys.
    const configuredSkillKeys = Object.fromEntries(
      Object.keys(configuredSkillsNormalized).map((k) => [k, ""]),
    );
    const orphanedSkills = findOrphanedSkills(lockedPack, remainingPacks, configuredSkillKeys);

    // Remove orphaned skills from disk and settings/lockfile
    yield* Effect.forEach(
      orphanedSkills,
      (skillFqn) =>
        Effect.gen(function* () {
          // Remove skill files from all known canonical locations
          const sanitized = sanitizeName(skillFqn);
          const extensionsDir = path.join(base, REGISTRY_EXTENSIONS_DIR);
          const extensionsDirExists = yield* fs
            .exists(extensionsDir)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));

          if (extensionsDirExists) {
            const scopeDirs = yield* fs
              .readDirectory(extensionsDir)
              .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

            yield* Effect.forEach(
              scopeDirs,
              (scopeDir) => {
                if (!scopeDir.startsWith("@")) return Effect.void;
                const skillPath = path.join(extensionsDir, scopeDir, "skills", sanitized);
                return removeIfExists(fs, skillPath);
              },
              { concurrency: "unbounded" },
            );
          }

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
  });
