/**
 * Transient file backup helpers. Error-generic: the caller supplies the
 * decoration for an operation failure that leaves a retained backup behind.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

export interface TransientFileBackup {
  readonly directory: string;
  readonly path: string;
}

/** A transient-backup filesystem step failed. */
export class TransientBackupFailed extends Data.TaggedError("TransientBackupFailed")<{
  /** The source path for `create-temp-dir`; the backup path otherwise. */
  readonly path: string;
  readonly step: "create-temp-dir" | "write-backup" | "remove-backup";
  readonly cause: unknown;
}> {}

export const createTransientFileBackup = (args: {
  readonly sourcePath: string;
  readonly content: string;
  readonly tempPrefix: string;
}): Effect.Effect<TransientFileBackup, TransientBackupFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tempDir = yield* fs
      .makeTempDirectory({ prefix: args.tempPrefix })
      .pipe(
        Effect.mapError(
          (cause) =>
            new TransientBackupFailed({ path: args.sourcePath, step: "create-temp-dir", cause }),
        ),
      );
    const backupPath = path.join(tempDir, `${path.basename(args.sourcePath)}.bak`);
    yield* fs
      .writeFileString(backupPath, args.content)
      .pipe(
        Effect.mapError(
          (cause) => new TransientBackupFailed({ path: backupPath, step: "write-backup", cause }),
        ),
      );
    return { directory: tempDir, path: backupPath };
  });

export const removeTransientFileBackup = (
  backup: TransientFileBackup,
): Effect.Effect<void, TransientBackupFailed, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs
      .remove(backup.directory, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) => new TransientBackupFailed({ path: backup.path, step: "remove-backup", cause }),
        ),
      );
  });

export const runWithTransientFileBackup = <A, E, E2, R>(args: {
  readonly sourcePath: string;
  readonly oldRaw: string;
  readonly newRaw: string;
  readonly tempPrefix: string;
  readonly operation: Effect.Effect<A, E, R>;
  /** Decorate an operation failure whose pre-write backup was retained. */
  readonly onBackupRetained: (error: E, backupPath: string) => E2;
}): Effect.Effect<A, E | E2 | TransientBackupFailed, R | FileSystem.FileSystem | Path.Path> =>
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
      Effect.mapError((error) => args.onBackupRetained(error, backup.path)),
    );
  });
