/**
 * Shared filesystem helpers for skill operations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";

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
