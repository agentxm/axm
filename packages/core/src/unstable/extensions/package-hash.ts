/**
 * Content hashing for installed extension packages.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { computeSourceHash } from "./rendered-files.js";
import type { SourceHash } from "./rendered-files.js";
import { CANONICAL_MATERIALIZATION_MARKER_FILENAME } from "./materialization-marker.js";

/**
 * Compute an advisory SHA-256 change marker over package content recursively.
 * AXM's canonical completion marker is workspace metadata and is excluded.
 *
 * File order is normalized by sorting on relative path, and each entry
 * contributes its path and bytes separated by NUL so that a rename cannot
 * collide with a content change.
 *
 * The result is a change-detection marker for created/updated/unchanged
 * reporting, never a tamper seal — installed content is workspace-owned and
 * may be rewritten by content-preserving tools after install.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computePackageContentHash = (
  packageDir: string,
): Effect.Effect<SourceHash, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const rawEntries = yield* fs.readDirectory(packageDir, { recursive: true });
    const candidates = yield* Effect.forEach(
      rawEntries,
      (relativePath) =>
        Effect.gen(function* () {
          const absolutePath = path.join(packageDir, relativePath);
          const info = yield* fs.stat(absolutePath);
          return { relativePath, absolutePath, isFile: info.type === "File" };
        }),
      { concurrency: 16 },
    );
    const files = candidates.filter(
      (candidate) =>
        candidate.isFile && candidate.relativePath !== CANONICAL_MATERIALIZATION_MARKER_FILENAME,
    );
    files.sort((left, right) =>
      left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0,
    );
    const hash = crypto.createHash("sha256");
    for (const file of files) {
      hash.update(file.relativePath);
      hash.update("\0");
      hash.update(yield* fs.readFile(file.absolutePath));
      hash.update("\0");
    }
    return computeSourceHash(hash.digest("hex"));
  }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: `Failed to hash package content at ${packageDir}`,
        cause,
      }),
    ),
  );
