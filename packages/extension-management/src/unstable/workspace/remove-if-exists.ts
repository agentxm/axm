/**
 * Transaction-aware removal of canonical extension paths.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import { protectWorkspacePath } from "./transaction.js";
import { recordFootprint } from "./footprint-recorder.js";

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
