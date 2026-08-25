/**
 * Shared filesystem helpers for canonical extension cleanup.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { fileURLToPath } from "node:url";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import { recordFootprint } from "../workspace/footprint-recorder.js";

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
    yield* recordFootprint({ path: dirPath, change: "removed" });
  });

/** Convert a file URL to the current platform's native path representation. */
export const stripFileProtocol = (location: string): string =>
  location.startsWith("file:") ? fileURLToPath(location) : location;
