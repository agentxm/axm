/**
 * Content hashing for skill directories.
 *
 * Computes deterministic SHA-256 hashes of directory contents for lockfile integrity.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { createHash } from "node:crypto";
import { FileSystem, Path } from "@effect/platform";
import { Data, Effect } from "effect";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error that occurs during content hash computation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class HashError extends Data.TaggedError("HashError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

/**
 * Recursively lists all files in a directory.
 *
 * @internal
 */
const listFilesRecursively = (
  directory: string,
): Effect.Effect<readonly string[], HashError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const walk = (
      dir: string,
    ): Effect.Effect<readonly string[], HashError, FileSystem.FileSystem> =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(dir).pipe(
          Effect.mapError(
            (e) =>
              new HashError({
                message: `Failed to read directory: ${dir}`,
                cause: e,
              }),
          ),
        );

        const results: string[] = [];

        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(
            Effect.mapError(
              (e) =>
                new HashError({
                  message: `Failed to stat file: ${fullPath}`,
                  cause: e,
                }),
            ),
          );

          if (stat.type === "Directory") {
            const subFiles = yield* walk(fullPath);
            results.push(...subFiles);
          } else if (stat.type === "File") {
            results.push(fullPath);
          }
        }

        return results;
      });

    return yield* walk(directory);
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Computes a deterministic SHA-256 content hash for a directory.
 *
 * The hash is computed by:
 * 1. Listing all files in the directory recursively
 * 2. Sorting file paths alphabetically (for determinism)
 * 3. For each file: hashing `relativePath + "\0" + content`
 * 4. Combining all file hashes into a final hash
 *
 * Properties:
 * - Hash is deterministic for the same content
 * - Hash is independent of file system metadata (timestamps, permissions)
 * - Hash changes when any file content changes
 * - Hash changes when files are added or removed
 *
 * @param directory - The directory to hash
 * @returns The content hash in format `sha256:<hex>`
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { computeContentHash } from "@agentxm/core/experimental/skills";
 * import { Effect } from "effect";
 * import { NodeContext } from "@effect/platform-node";
 *
 * const program = Effect.gen(function* () {
 *   const hash = yield* computeContentHash("./my-skill");
 *   console.log(hash); // "sha256:abc123..."
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(NodeContext.layer)));
 * ```
 */
export const computeContentHash = (
  directory: string,
): Effect.Effect<string, HashError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // List all files recursively
    const allFiles = yield* listFilesRecursively(directory);

    // Compute relative paths and sort alphabetically for determinism
    const relativePaths = allFiles
      .map((file) => ({
        absolute: file,
        relative: path.relative(directory, file),
      }))
      .sort((a, b) => a.relative.localeCompare(b.relative));

    // Create the final hasher
    const finalHasher = createHash("sha256");

    // Hash each file's relative path and content
    for (const { absolute, relative } of relativePaths) {
      const content = yield* fs.readFile(absolute).pipe(
        Effect.mapError(
          (e) =>
            new HashError({
              message: `Failed to read file: ${absolute}`,
              cause: e,
            }),
        ),
      );

      // Hash: relativePath + null byte + content
      const fileHasher = createHash("sha256");
      fileHasher.update(relative);
      fileHasher.update("\0");
      fileHasher.update(content);
      const fileHash = fileHasher.digest();

      // Add the file hash to the final hash
      finalHasher.update(fileHash);
    }

    return `sha256:${finalHasher.digest("hex")}`;
  });
