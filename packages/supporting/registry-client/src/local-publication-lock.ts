/**
 * One publication owns one filesystem lock. The filesystem coordinates every
 * client and process; no process-global table or second semaphore is needed.
 * A complete owner record is published by one exclusive hard link, so a failed
 * metadata write cannot leave an anonymous lock behind.
 * Cooperating local publishers share a host and PID namespace. Only confirmed
 * dead owners are reaped; foreign-host owners wait, and invalid records or an
 * abandoned recovery gate require manual recovery. Token checks preserve
 * protocol successors, not arbitrary concurrent manual replacement of files.
 */
import { hostname } from "node:os";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { RegistryOperationFailed } from "./errors.js";

const retryDelay = Duration.millis(25);
const staleAfter = Duration.toMillis(Duration.minutes(5));
const OwnerSchema = Schema.Struct({
  token: Schema.String.check(Schema.isUUID()),
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  host: Schema.NonEmptyString,
  acquiredAt: Schema.Number.check(Schema.isFinite()),
});
type Owner = typeof OwnerSchema.Type;
const decodeOwner = Schema.decodeUnknownEffect(Schema.fromJsonString(OwnerSchema));

const failure = (step: string, lockPath: string, cause?: unknown) =>
  new RegistryOperationFailed({
    category: "internal",
    detail: `Could not ${step} local registry publication lock: ${lockPath}`,
    ...(cause === undefined ? {} : { cause }),
  });

const readOwner = (fs: FileSystem.FileSystem, lockPath: string) =>
  fs.readFileString(lockPath).pipe(
    Effect.map(Option.some),
    Effect.catch((cause) =>
      cause.reason._tag === "NotFound"
        ? Effect.succeed(Option.none<string>())
        : Effect.fail(failure("read", lockPath, cause)),
    ),
    Effect.flatMap((content) =>
      Option.isNone(content)
        ? Effect.succeed(Option.none<Owner>())
        : decodeOwner(content.value).pipe(
            Effect.map(Option.some),
            Effect.mapError(() => failure("decode owner of", lockPath)),
          ),
    ),
  );

const errorCode = (cause: unknown) =>
  typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;

const ownerIsActive = (owner: Owner, lockPath: string) =>
  Effect.try({ try: () => process.kill(owner.pid, 0), catch: (cause) => cause }).pipe(
    Effect.as(true),
    Effect.catch((cause) => {
      const code = errorCode(cause);
      if (code === "ESRCH") return Effect.succeed(false);
      if (code === "EPERM") return Effect.succeed(true);
      return Effect.fail(failure("inspect owner of", lockPath, cause));
    }),
  );

const releaseOwned = (fs: FileSystem.FileSystem, lockPath: string, token: string) =>
  Effect.gen(function* () {
    const owner = yield* readOwner(fs, lockPath);
    if (Option.isNone(owner) || owner.value.token !== token) return;
    yield* fs
      .remove(lockPath)
      .pipe(
        Effect.catch((cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.void
            : Effect.fail(failure("release", lockPath, cause)),
        ),
      );
  });

/** A single exclusive-link attempt, never a contention wait. */
const tryAcquire = (fs: FileSystem.FileSystem, preparedOwner: string, lockPath: string) =>
  fs.link(preparedOwner, lockPath).pipe(
    Effect.as(true),
    Effect.catch((cause) =>
      cause.reason._tag === "AlreadyExists"
        ? Effect.succeed(false)
        : Effect.fail(failure("acquire", lockPath, cause)),
    ),
  );

const reclaimDeadOwner = (
  fs: FileSystem.FileSystem,
  lockPath: string,
  preparedOwner: string,
  contender: Owner,
) =>
  Effect.gen(function* () {
    const observed = yield* readOwner(fs, lockPath);
    if (Option.isNone(observed)) return;
    const expired = (yield* Clock.currentTimeMillis) - observed.value.acquiredAt >= staleAfter;
    // A slow or paused live publisher is never evicted because its mtime aged.
    // A different host's pid cannot be checked by this process.
    if (
      !expired ||
      observed.value.host !== contender.host ||
      (yield* ownerIsActive(observed.value, lockPath))
    )
      return;

    const recoveryPath = `${lockPath}.recovery`;
    yield* Effect.acquireUseRelease(
      tryAcquire(fs, preparedOwner, recoveryPath),
      (acquired) =>
        Effect.gen(function* () {
          if (!acquired) {
            const recovery = yield* readOwner(fs, recoveryPath);
            if (
              Option.isSome(recovery) &&
              recovery.value.host === contender.host &&
              !(yield* ownerIsActive(recovery.value, recoveryPath))
            ) {
              return yield* new RegistryOperationFailed({
                category: "conflict",
                detail: `A stopped process left publication recovery unfinished: ${recoveryPath}`,
                suggestions: [
                  {
                    description:
                      "Verify no publication is running, remove the abandoned recovery lock, and retry.",
                  },
                ],
              });
            }
            return;
          }
          // Serialize stale reapers and re-read inside the gate. Another contender
          // may have replaced the observed lock before this gate was granted.
          const current = yield* readOwner(fs, lockPath);
          if (Option.isNone(current) || current.value.token !== observed.value.token) return;
          if (yield* ownerIsActive(current.value, lockPath)) return;
          yield* releaseOwned(fs, lockPath, current.value.token);
        }),
      (acquired) => (acquired ? releaseOwned(fs, recoveryPath, contender.token) : Effect.void),
    );
  });

export const withLocalPublicationLock = <A, E, R>(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  lockPath: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | RegistryOperationFailed, R> =>
  Effect.gen(function* () {
    const owner: Owner = {
      token: globalThis.crypto.randomUUID(),
      pid: process.pid,
      host: hostname(),
      acquiredAt: yield* Clock.currentTimeMillis,
    };
    return yield* Effect.acquireUseRelease(
      fs
        .makeTempDirectory({ directory: path.dirname(lockPath), prefix: ".publication-" })
        .pipe(Effect.mapError((cause) => failure("prepare", lockPath, cause))),
      (directory) =>
        Effect.gen(function* () {
          const preparedOwner = path.join(directory, "owner.json");
          yield* fs
            .writeFileString(preparedOwner, JSON.stringify(owner), { flag: "wx", mode: 0o600 })
            .pipe(Effect.mapError((cause) => failure("record owner of", lockPath, cause)));
          while (true) {
            const attempt = yield* Effect.uninterruptibleMask((restore) =>
              Effect.acquireUseRelease(
                tryAcquire(fs, preparedOwner, lockPath),
                (acquired) =>
                  acquired
                    ? restore(effect).pipe(Effect.map(Option.some))
                    : Effect.succeed(Option.none<A>()),
                (acquired) => (acquired ? releaseOwned(fs, lockPath, owner.token) : Effect.void),
              ),
            );
            if (Option.isSome(attempt)) return attempt.value;
            // Neither the ownership inspection nor the wait is masked. Every grant
            // above already has release registered before interruption is restored.
            yield* reclaimDeadOwner(fs, lockPath, preparedOwner, owner);
            yield* Effect.sleep(retryDelay);
          }
        }),
      (directory) =>
        fs
          .remove(directory, { recursive: true })
          .pipe(Effect.mapError((cause) => failure("clean up staged owner of", lockPath, cause))),
    );
  });
