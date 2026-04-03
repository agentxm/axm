/**
 * Shared extension utilities.
 *
 * Cross-cutting utilities used by multiple extension types.
 * Promoted from skills-specific modules to avoid cross-feature dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PlatformError } from "effect/PlatformError";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import { isPathSafe } from "../utils/index.js";

// -----------------------------------------------------------------------------
// Name Sanitization
// -----------------------------------------------------------------------------

/**
 * Sanitizes an extension name into a safe on-disk directory name.
 *
 * Transformation pipeline:
 * 1. Convert to lowercase
 * 2. Replace non-alphanumeric characters (except `.` and `_`) with hyphens
 * 3. Strip leading and trailing dots and hyphens
 * 4. Truncate to 255 characters
 * 5. Fall back to `"unnamed-skill"` if empty
 */
export const sanitizeName = (name: string): string => {
  let result = name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "");

  result = result.slice(0, 255);

  return result || "unnamed-skill";
};

// -----------------------------------------------------------------------------
// Path Safety Validation
// -----------------------------------------------------------------------------

export const validatePathSafety = (baseDir: string, targetPath: string, code: string) =>
  isPathSafe(baseDir, targetPath)
    ? Effect.void
    : makeAppError({
        code,
        what: `Path traversal detected: ${targetPath}`,
      });

// -----------------------------------------------------------------------------
// Extension Directory Copy
// -----------------------------------------------------------------------------

const EXCLUDED_NAMES = new Set(["README.md", "metadata.json", ".git"]);

const isExcluded = (name: string): boolean => EXCLUDED_NAMES.has(name) || name.startsWith("_");

const copyEntry = (
  src: string,
  dest: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    // Read through symlinks (stat follows symlinks by default)
    const info = yield* fs.stat(src);

    if (info.type === "Directory") {
      yield* copyDir(src, dest, fs, path);
    } else {
      // Copy file content — readFile follows symlinks, giving us dereferenced content
      const content = yield* fs.readFile(src);
      yield* fs.makeDirectory(path.dirname(dest), { recursive: true });
      yield* fs.writeFile(dest, content);
    }
  });

const copyDir = (
  src: string,
  dest: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    yield* fs.makeDirectory(dest, { recursive: true });
    const entries = yield* fs.readDirectory(src);

    yield* Effect.forEach(
      entries.filter((name) => !isExcluded(name)),
      (name) => copyEntry(path.join(src, name), path.join(dest, name), fs, path),
      { concurrency: "unbounded" },
    );
  });

/**
 * Recursively copies an extension directory from `src` to `dest`.
 *
 * Exclusions: README.md, metadata.json, `_`-prefixed entries, `.git`.
 * Symlinks are dereferenced (file content is copied, not the link).
 * Directory entries are copied concurrently.
 */
export const copyExtensionDirectory = (
  src: string,
  dest: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* copyDir(src, dest, fs, path);
  });
