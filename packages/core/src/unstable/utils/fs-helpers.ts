/**
 * Shared filesystem helpers for canonical extension cleanup.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { fileURLToPath } from "node:url";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/constants.js";
import { protectWorkspacePath } from "../workspace/transaction.js";

/**
 * Remove a directory if it exists.
 */
export const removeIfExists = (fsService: FileSystem.FileSystem, dirPath: string) =>
  Effect.gen(function* () {
    const exists = yield* fsService.exists(dirPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect canonical extension path ${dirPath}`,
          cause: error,
        }),
      ),
    );
    if (!exists) return;
    yield* protectWorkspacePath(dirPath);
    yield* fsService.remove(dirPath, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to remove canonical extension path ${dirPath}`,
          cause: error,
        }),
      ),
    );
  });

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
  exceptPath?: string,
) =>
  Effect.gen(function* () {
    const removeUnlessPreserved = (target: string) =>
      exceptPath !== undefined && pathService.resolve(target) === pathService.resolve(exceptPath)
        ? Effect.void
        : removeIfExists(fsService, target);
    // Remove from non-registry canonical location
    yield* removeUnlessPreserved(
      pathService.join(base, EXTERNAL_EXTENSIONS_DIR, directory, sanitizedName),
    );

    // Remove from any registry canonical location
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService.exists(extensionsDir).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect registry extension directory ${extensionsDir}`,
          cause: error,
        }),
      ),
    );

    if (extensionsDirExists) {
      const scopeDirs = yield* fsService.readDirectory(extensionsDir).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to list registry extension directory ${extensionsDir}`,
            cause: error,
          }),
        ),
      );

      yield* Effect.forEach(
        scopeDirs,
        (scopeDir) => {
          if (!scopeDir.startsWith("@")) return Effect.void;
          const canonicalPath = pathService.join(extensionsDir, scopeDir, directory, sanitizedName);
          return removeUnlessPreserved(canonicalPath);
        },
        { concurrency: "unbounded" },
      );
    }
  });

/** Convert a file URL to the current platform's native path representation. */
export const stripFileProtocol = (location: string): string =>
  location.startsWith("file:") ? fileURLToPath(location) : location;
