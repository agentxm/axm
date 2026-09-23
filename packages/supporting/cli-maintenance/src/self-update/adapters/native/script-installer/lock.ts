import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { UpgradeFailed } from "../../../application/errors.js";
import { nativeUpgradeFailure } from "./failure.js";

const LockDataSchema = Schema.Struct({
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  targetPath: Schema.String,
  backupPath: Schema.NullOr(Schema.String),
});
type LockData = typeof LockDataSchema.Type;
const decodeLock = Schema.decodeUnknownEffect(Schema.fromJsonString(LockDataSchema));

const ownerIsActive = (pid: number) =>
  Effect.try({
    try: () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        const code: unknown = Reflect.get(Object(error), "code");
        if (code === "ESRCH") return false;
        if (code === "EPERM") return true;
        throw error;
      }
    },
    catch: () =>
      new UpgradeFailed({
        category: "internal",
        step: "lock-inspect",
        detail: "The executable upgrade lock owner could not be inspected",
      }),
  });

type LockResult = { readonly acquired: true; readonly path: string } | { readonly acquired: false };

export const acquireUpgradeLock = (fs: FileSystem.FileSystem, targetPath: string) =>
  Effect.gen(function* () {
    const lockPath = `${targetPath}.upgrade.lock`;
    const initial: LockData = { pid: process.pid, targetPath, backupPath: null };
    const write = fs.writeFileString(lockPath, `${JSON.stringify(initial)}\n`, { flag: "wx" }).pipe(
      Effect.as(true),
      Effect.catch((cause) =>
        cause.reason._tag === "AlreadyExists"
          ? Effect.succeed(false)
          : Effect.fail(nativeUpgradeFailure("lock-create", cause)),
      ),
    );
    if (yield* write) {
      return { acquired: true, path: lockPath } satisfies LockResult;
    }

    const existing = yield* fs.readFileString(lockPath).pipe(
      Effect.mapError((cause) => nativeUpgradeFailure("lock-read", cause)),
      Effect.flatMap((content) =>
        decodeLock(content).pipe(
          Effect.mapError(
            () =>
              new UpgradeFailed({
                category: "validation",
                step: "lock-decode",
                detail: `The executable upgrade lock is invalid: ${lockPath}`,
              }),
          ),
        ),
      ),
    );
    if (yield* ownerIsActive(existing.pid)) {
      return { acquired: false } satisfies LockResult;
    }

    if (
      existing.backupPath !== null &&
      !(yield* fs
        .exists(targetPath)
        .pipe(Effect.mapError((cause) => nativeUpgradeFailure("lock-inspect", cause)))) &&
      (yield* fs
        .exists(existing.backupPath)
        .pipe(Effect.mapError((cause) => nativeUpgradeFailure("lock-inspect", cause))))
    ) {
      yield* fs
        .rename(existing.backupPath, targetPath)
        .pipe(
          Effect.mapError((cause) =>
            nativeUpgradeFailure("lock-recover", cause, existing.backupPath ?? undefined),
          ),
        );
    }
    yield* fs
      .remove(lockPath)
      .pipe(Effect.mapError((cause) => nativeUpgradeFailure("lock-remove-stale", cause)));
    if (yield* write) {
      return { acquired: true, path: lockPath } satisfies LockResult;
    }
    return { acquired: false } satisfies LockResult;
  });

export const updateLockBackup = (
  fs: FileSystem.FileSystem,
  lockPath: string,
  targetPath: string,
  backupPath: string,
) =>
  Effect.gen(function* () {
    const data: LockData = { pid: process.pid, targetPath, backupPath };
    yield* fs.writeFileString(lockPath, `${JSON.stringify(data)}\n`);
  });
