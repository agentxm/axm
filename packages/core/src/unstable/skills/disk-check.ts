/**
 * Shared helper for checking if a skill exists on disk in any canonical location.
 *
 * Used by SkillManager.isInstalled and uninstall-skill to detect whether a skill
 * is present in the external or registry extension directories.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { sanitizeName } from "../extensions/utils.js";

export const existsInAnyCanonicalLocation = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  skillName: string,
) =>
  Effect.gen(function* () {
    const sanitizedName = sanitizeName(skillName);

    const canonicalExists = yield* fsService
      .exists(pathService.join(baseDir, EXTERNAL_EXTENSIONS_DIR, "skills", sanitizedName))
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (canonicalExists) return true;

    const extensionsDir = pathService.join(baseDir, REGISTRY_EXTENSIONS_DIR);
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
        const skillPath = pathService.join(extensionsDir, scopeDir, "skills", sanitizedName);
        return fsService.exists(skillPath).pipe(Effect.catch(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });
