/**
 * Filesystem absence as a fact: a missing entry becomes a value while every
 * other failure stays typed, so callers map it into their own errors.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type { PlatformError } from "effect/PlatformError";

/** Whether a filesystem failure reports that the entry does not exist. */
export const isNotFound = (error: PlatformError): boolean => error.reason._tag === "NotFound";

/** Read a file as text, or `None` when it does not exist. */
export const readFileStringIfPresent = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<Option.Option<string>, PlatformError> =>
  fs.readFileString(filePath).pipe(
    Effect.map(Option.some),
    Effect.catchIf(isNotFound, () => Effect.succeedNone),
  );
