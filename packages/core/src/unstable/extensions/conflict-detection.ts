/**
 * Conflict detection for extension-rendered files.
 *
 * Determines whether a file is absent, owned by axm (has a managed marker),
 * or in conflict (exists without a managed marker). Returns data only —
 * no policy decisions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import type * as PlatformError from "effect/PlatformError";
import { makeAppError, type AppError } from "../app-error/index.js";
import { isManagedByAxm } from "./managed-marker.js";

/**
 * Tagged union representing the result of conflict detection.
 *
 * - `Absent`: file does not exist
 * - `Owned`: file exists with a managed marker (safe to re-render)
 * - `Conflict`: file exists without a managed marker (user-owned)
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ConflictDetectionResult =
  | { readonly _tag: "Absent" }
  | { readonly _tag: "Owned" }
  | { readonly _tag: "Conflict" };

const Absent: ConflictDetectionResult = { _tag: "Absent" };
const Owned: ConflictDetectionResult = { _tag: "Owned" };
const Conflict: ConflictDetectionResult = { _tag: "Conflict" };

const classifyContent = (content: string): ConflictDetectionResult =>
  isManagedByAxm(content) ? Owned : Conflict;

const isNotFound = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound";

/**
 * Detect whether a file path is absent, owned by axm, or in conflict.
 *
 * When `fileContent` is provided, it is used directly instead of reading
 * from disk. This is useful when the content is already available.
 *
 * Returns data only — callers decide what policy to apply.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectConflict = (
  filePath: string,
  fileContent?: string,
): Effect.Effect<ConflictDetectionResult, AppError, FileSystem.FileSystem> => {
  if (fileContent !== undefined) {
    return Effect.succeed(classifyContent(fileContent));
  }

  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath).pipe(
      Effect.map(classifyContent),
      Effect.catch((error) => {
        if (isNotFound(error)) {
          return Effect.succeed(Absent);
        }
        return Effect.fail(
          makeAppError({
            code: "FILE_READ_ERROR",
            what: `Failed to read file: ${filePath}`,
            details: [String(error)],
            howToFix: "Check file permissions and ensure the path is accessible.",
            cause: error,
          }),
        );
      }),
    );
  });
};
