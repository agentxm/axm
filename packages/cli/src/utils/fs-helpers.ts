/**
 * Shared filesystem helpers for skill operations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/constants.js";

/**
 * Remove a directory if it exists, ignoring errors.
 */
export const removeIfExists = (fsService: FileSystem.FileSystem, dirPath: string) =>
  fsService.exists(dirPath).pipe(
    Effect.catchAll(() => Effect.succeed(false)),
    Effect.flatMap((exists) =>
      exists ? fsService.remove(dirPath, { recursive: true }).pipe(Effect.ignore) : Effect.void,
    ),
  );

/**
 * Remove a skill from ALL known canonical locations.
 *
 * Ensures clean removal regardless of where the skill was installed:
 * 1. `.axm/extensions/external/skills/<name>/` (non-registry canonical)
 * 2. `.axm/extensions/@* /skills/<name>/` (registry canonical, any namespace)
 */
export const removeFromAllCanonicalLocations = (
  fsService: FileSystem.FileSystem,
  base: string,
  sanitizedName: string,
  pathService: Path.Path,
) =>
  Effect.gen(function* () {
    // Remove from non-registry canonical location
    yield* removeIfExists(
      fsService,
      pathService.join(base, EXTERNAL_EXTENSIONS_DIR, "skills", sanitizedName),
    );

    // Remove from any registry canonical location
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (extensionsDirExists) {
      const scopeDirs = yield* fsService
        .readDirectory(extensionsDir)
        .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

      yield* Effect.forEach(
        scopeDirs,
        (scopeDir) => {
          if (!scopeDir.startsWith("@")) return Effect.void;
          const skillPath = pathService.join(extensionsDir, scopeDir, "skills", sanitizedName);
          return removeIfExists(fsService, skillPath);
        },
        { concurrency: "unbounded" },
      );
    }
  });

/**
 * Strip the `file://` protocol prefix from a location string.
 */
export const stripFileProtocol = (location: string): string => location.replace(/^file:\/\//, "");
