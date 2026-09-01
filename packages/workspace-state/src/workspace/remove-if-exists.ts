/**
 * Transaction-aware removal of canonical extension paths.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import { CanonicalPathRemovalError } from "./errors.js";
import { protectWorkspacePath } from "./transaction.js";
import { recordFootprint } from "./footprint-recorder.js";

/**
 * Remove a directory if it exists.
 */
export const removeIfExists = (fsService: FileSystem.FileSystem, dirPath: string) =>
  Effect.gen(function* () {
    const exists = yield* fsService
      .exists(dirPath)
      .pipe(
        Effect.mapError(
          (cause) => new CanonicalPathRemovalError({ path: dirPath, step: "inspect", cause }),
        ),
      );
    if (!exists) return;
    yield* protectWorkspacePath(dirPath);
    yield* fsService
      .remove(dirPath, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) => new CanonicalPathRemovalError({ path: dirPath, step: "remove", cause }),
        ),
      );
    yield* recordFootprint({ path: dirPath, change: "removed" });
  });
