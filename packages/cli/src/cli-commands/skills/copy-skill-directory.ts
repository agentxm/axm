/**
 * Recursive skill directory copy with exclusions.
 *
 * Copies a skill's source directory to a destination, excluding
 * non-essential files (README.md, metadata.json, _-prefixed, .git).
 * Dereferences symlinks so the copy contains real file content.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as nodePath from "node:path";
import type { PlatformError } from "@effect/platform/Error";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";

// -----------------------------------------------------------------------------
// Exclusion rules
// -----------------------------------------------------------------------------

const EXCLUDED_NAMES = new Set(["README.md", "metadata.json", ".git"]);

const isExcluded = (name: string): boolean => EXCLUDED_NAMES.has(name) || name.startsWith("_");

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const copyEntry = (
  src: string,
  dest: string,
  fs: FileSystem.FileSystem,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    // Read through symlinks (stat follows symlinks by default)
    const info = yield* fs.stat(src);

    if (info.type === "Directory") {
      yield* copyDir(src, dest, fs);
    } else {
      // Copy file content — readFile follows symlinks, giving us dereferenced content
      const content = yield* fs.readFile(src);
      yield* fs.makeDirectory(nodePath.dirname(dest), { recursive: true });
      yield* fs.writeFile(dest, content);
    }
  });

const copyDir = (
  src: string,
  dest: string,
  fs: FileSystem.FileSystem,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    yield* fs.makeDirectory(dest, { recursive: true });
    const entries = yield* fs.readDirectory(src);

    yield* Effect.forEach(
      entries.filter((name) => !isExcluded(name)),
      (name) => copyEntry(nodePath.join(src, name), nodePath.join(dest, name), fs),
      { concurrency: "unbounded" },
    );
  });

/**
 * Recursively copies a skill directory from `src` to `dest`.
 *
 * Exclusions: README.md, metadata.json, `_`-prefixed entries, `.git`.
 * Symlinks are dereferenced (file content is copied, not the link).
 * Directory entries are copied concurrently.
 */
export const copySkillDirectory = (
  src: string,
  dest: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* copyDir(src, dest, fs);
  });
