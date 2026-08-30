/**
 * Transient file backup helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";

export interface TransientFileBackup {
  readonly directory: string;
  readonly path: string;
}

const backupRetainedDetail = (error: AppError, backupPath: string): AppError =>
  makeAppError({
    code: error.code,
    title: error.title,
    detail: `${error.detail}\nOriginal file backup retained at: ${backupPath}`,
    ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error.cause,
  });

export const createTransientFileBackup = (args: {
  readonly sourcePath: string;
  readonly content: string;
  readonly tempPrefix: string;
}): Effect.Effect<TransientFileBackup, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tempDir = yield* fs.makeTempDirectory({ prefix: args.tempPrefix }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create temporary directory for backup of ${args.sourcePath}`,
          cause: error,
        }),
      ),
    );
    const backupPath = path.join(tempDir, `${path.basename(args.sourcePath)}.bak`);
    yield* fs.writeFileString(backupPath, args.content).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write backup: ${backupPath}`,
          cause: error,
        }),
      ),
    );
    return { directory: tempDir, path: backupPath };
  });

export const removeTransientFileBackup = (
  backup: TransientFileBackup,
): Effect.Effect<void, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(backup.directory, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to remove temporary backup after successful write: ${backup.path}`,
          cause: error,
        }),
      ),
    );
  });

export const runWithTransientFileBackup = <A, R>(args: {
  readonly sourcePath: string;
  readonly oldRaw: string;
  readonly newRaw: string;
  readonly tempPrefix: string;
  readonly operation: Effect.Effect<A, AppError, R>;
}): Effect.Effect<A, AppError, R | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (args.oldRaw === "" || args.oldRaw === args.newRaw) {
      return yield* args.operation;
    }
    const backup = yield* createTransientFileBackup({
      sourcePath: args.sourcePath,
      content: args.oldRaw,
      tempPrefix: args.tempPrefix,
    });
    return yield* args.operation.pipe(
      Effect.tap(() => removeTransientFileBackup(backup).pipe(Effect.ignore)),
      Effect.mapError((error) => backupRetainedDetail(error, backup.path)),
    );
  });
