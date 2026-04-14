/**
 * Shared filesystem helpers for canonical extension cleanup.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/constants.js";

/**
 * Remove a directory if it exists, ignoring errors.
 */
export const removeIfExists = (fsService: FileSystem.FileSystem, dirPath: string) =>
  fsService.exists(dirPath).pipe(
    Effect.catch(() => Effect.succeed(false)),
    Effect.flatMap((exists) =>
      exists ? fsService.remove(dirPath, { recursive: true }).pipe(Effect.ignore) : Effect.void,
    ),
  );

export type CanonicalExtensionDirectory = "skills" | "subagents";

/**
 * Remove an extension from all known canonical locations for its directory.
 *
 * Ensures clean removal regardless of where the extension was installed:
 * 1. `.axm/extensions/external/<directory>/<name>/` (non-registry canonical)
 * 2. `.axm/extensions/@scope/<directory>/<name>/` (registry canonical, any owner)
 */
export const removeFromAllCanonicalLocations = (
  fsService: FileSystem.FileSystem,
  base: string,
  directory: CanonicalExtensionDirectory,
  sanitizedName: string,
  pathService: Path.Path,
) =>
  Effect.gen(function* () {
    // Remove from non-registry canonical location
    yield* removeIfExists(
      fsService,
      pathService.join(base, EXTERNAL_EXTENSIONS_DIR, directory, sanitizedName),
    );

    // Remove from any registry canonical location
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
          const canonicalPath = pathService.join(extensionsDir, scopeDir, directory, sanitizedName);
          return removeIfExists(fsService, canonicalPath);
        },
        { concurrency: "unbounded" },
      );
    }
  });

/**
 * Strip the `file://` protocol prefix from a location string.
 */
export const stripFileProtocol = (location: string): string => location.replace(/^file:\/\//, "");
