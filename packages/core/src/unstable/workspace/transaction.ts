import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Semaphore from "effect/Semaphore";
import * as lockfile from "proper-lockfile";

import * as Layer from "effect/Layer";

import { makeAppError, type AppError } from "../app-error/index.js";
import { recordFootprint } from "./footprint-recorder.js";
import { writeOperationRecoveryRecord } from "./operation-records.js";
import { isWorkspaceTransitionHeldByThisInvocation } from "./transition-lock.js";

const TRANSACTION_LOCK_FILENAME = "workspace-transition.lock";
const LOCK_RETRY_DELAY = Duration.millis(25);
const LOCK_STALE_MILLIS = 2_000;
const LOCK_UPDATE_MILLIS = 1_000;

type Snapshot =
  | { readonly target: string; readonly state: "absent" }
  | { readonly target: string; readonly state: "copied"; readonly backup: string }
  | { readonly target: string; readonly state: "symlink"; readonly linkTarget: string };

interface WorkspaceTransactionContext {
  readonly backupDir: string;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly protectedTargets: Set<string>;
  readonly snapshots: Array<Snapshot>;
  readonly snapshotSemaphore: Semaphore.Semaphore;
}

const CurrentWorkspaceTransaction = ServiceMap.Reference<
  Option.Option<WorkspaceTransactionContext>
>("@agentxm/client-core/unstable/workspace/CurrentWorkspaceTransaction", {
  defaultValue: () => Option.none(),
});

export interface WorkspaceTransactionArgs<A, E, R> {
  readonly workspaceDir: string;
  /** In-process admission owned by the workspace service instance. */
  readonly semaphore: Semaphore.Semaphore;
  /** Authoritative files or directories that the transition may mutate. */
  readonly targets: ReadonlyArray<string>;
  /** Desired, lock, canonical, projection, and native-configuration mutation. */
  readonly transition: Effect.Effect<A, E, R>;
  /** Confirms the complete durable postcondition before the transaction commits. */
  readonly validate: (value: A) => Effect.Effect<void, E, R>;
  /** Observes the start of rollback restoration; never controls it. */
  readonly onRestorationStarted?: Effect.Effect<void>;
}

const transactionError = (detail: string, cause: unknown): AppError =>
  makeAppError({ code: "internal", detail, cause });

const normalizedTargets = (
  path: Path.Path,
  targets: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const sorted = Array.from(new Set(targets.map((target) => path.resolve(target)))).sort(
    (left, right) => left.length - right.length || left.localeCompare(right),
  );
  const retained: Array<string> = [];
  for (const target of sorted) {
    if (retained.some((parent) => target === parent || target.startsWith(`${parent}${path.sep}`))) {
      continue;
    }
    retained.push(target);
  }
  return retained;
};

const finalizeLockResource = (effect: Effect.Effect<void, AppError>): Effect.Effect<void> =>
  effect.pipe(
    Effect.tapError((error) => Effect.logError(error.detail)),
    Effect.ignore,
  );

const errorCode = (cause: unknown): string | undefined =>
  typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;

const acquireWorkspaceLock = (
  workspaceDir: string,
  lockPath: string,
  afterRelease: Effect.Effect<void>,
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      let release: (() => Promise<void>) | undefined;
      while (release === undefined) {
        const attempt = yield* Effect.tryPromise({
          try: () =>
            lockfile.lock(workspaceDir, {
              lockfilePath: lockPath,
              realpath: false,
              retries: 0,
              stale: LOCK_STALE_MILLIS,
              update: LOCK_UPDATE_MILLIS,
            }),
          catch: (cause) => ({ cause, code: errorCode(cause) }),
        }).pipe(Effect.result);
        if (attempt._tag === "Success") {
          release = attempt.success;
          break;
        }
        if (attempt.failure.code !== "ELOCKED") {
          return yield* transactionError(
            `Failed to acquire workspace transaction lock at ${lockPath}`,
            attempt.failure.cause,
          );
        }
        yield* restore(Effect.sleep(LOCK_RETRY_DELAY));
      }
      const releaseLock = release;
      yield* Effect.addFinalizer(() =>
        finalizeLockResource(
          Effect.tryPromise({
            try: () => releaseLock(),
            catch: (cause) =>
              transactionError(
                `Failed to release workspace transaction lock at ${lockPath}`,
                cause,
              ),
          }),
        ).pipe(Effect.andThen(afterRelease)),
      );
    }),
  );

const snapshotTargets = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  backupDir: string,
  targets: ReadonlyArray<string>,
  startIndex = 0,
): Effect.Effect<ReadonlyArray<Snapshot>, AppError> =>
  Effect.forEach(targets, (target, index) =>
    Effect.gen(function* () {
      const link = yield* fs.readLink(target).pipe(Effect.option);
      if (Option.isSome(link)) {
        return { target, state: "symlink", linkTarget: link.value } satisfies Snapshot;
      }
      const exists = yield* fs
        .exists(target)
        .pipe(
          Effect.mapError((error) =>
            transactionError(`Failed to inspect transaction target ${target}`, error),
          ),
        );
      if (!exists) return { target, state: "absent" } satisfies Snapshot;

      const backup = path.join(backupDir, (startIndex + index).toString(36));
      yield* fs
        .copy(target, backup, { preserveTimestamps: true })
        .pipe(
          Effect.mapError((error) =>
            transactionError(`Failed to snapshot transaction target ${target}`, error),
          ),
        );
      return { target, state: "copied", backup } satisfies Snapshot;
    }),
  );

const protectInContext = (
  context: WorkspaceTransactionContext,
  target: string,
): Effect.Effect<void, AppError> =>
  context.snapshotSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const normalized = context.path.resolve(target);
      if (context.protectedTargets.has(normalized)) return;
      const [snapshot] = yield* snapshotTargets(
        context.fs,
        context.path,
        context.backupDir,
        [normalized],
        context.snapshots.length,
      );
      if (snapshot === undefined) {
        return yield* transactionError(`Failed to snapshot transaction target ${normalized}`, {
          reason: "snapshot was not produced",
        });
      }
      context.protectedTargets.add(normalized);
      context.snapshots.push(snapshot);
    }),
  );

/** Snapshot a path before its first mutation when a workspace transaction is active. */
export const protectWorkspacePath = (target: string): Effect.Effect<void, AppError> =>
  CurrentWorkspaceTransaction.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (context) => protectInContext(context, target),
      }),
    ),
  );

/**
 * Protect the first ancestor a recursive directory creation is about to
 * create, so restoration removes the created directory chain instead of
 * leaving empty parents behind. No-op outside a transaction or when the
 * directory already exists.
 */
export const protectCreatedAncestors = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  directory: string,
): Effect.Effect<void, AppError> =>
  CurrentWorkspaceTransaction.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (context) =>
          Effect.gen(function* () {
            let firstMissing: string | undefined;
            let current = path.resolve(directory);
            while (true) {
              const exists = yield* fs
                .exists(current)
                .pipe(
                  Effect.mapError((error) =>
                    transactionError(`Failed to inspect transaction ancestor ${current}`, error),
                  ),
                );
              if (exists) break;
              firstMissing = current;
              const parent = path.dirname(current);
              if (parent === current) break;
              current = parent;
            }
            if (firstMissing !== undefined) {
              yield* protectInContext(context, firstMissing);
            }
          }),
      }),
    ),
  );

const restoreSnapshot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshot: Snapshot,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    yield* fs.remove(snapshot.target, { recursive: true, force: true });
    if (snapshot.state === "absent") return;
    yield* fs.makeDirectory(path.dirname(snapshot.target), { recursive: true });
    if (snapshot.state === "symlink") {
      yield* fs.symlink(snapshot.linkTarget, snapshot.target);
      return;
    }
    yield* fs.copy(snapshot.backup, snapshot.target, { preserveTimestamps: true });
  });

const restoreAll = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
): Effect.Effect<void, PlatformError> =>
  Effect.forEach(
    [...snapshots].reverse(),
    (snapshot) =>
      restoreSnapshot(fs, path, snapshot).pipe(
        Effect.andThen(recordFootprint({ path: snapshot.target, change: "restored" })),
      ),
    {
      discard: true,
    },
  );

/**
 * Run one coupled workspace mutation under a scope-local lock.
 *
 * Every authoritative target is snapshotted before the transition begins. A
 * failed transition or postcondition check restores the exact pre-operation
 * paths. The lock is held by the operating system and released on descriptor
 * close or process death.
 */
export const runWorkspaceTransaction = <A, E, R>(
  args: WorkspaceTransactionArgs<A, E, R>,
): Effect.Effect<A, AppError | E, R | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const current = yield* CurrentWorkspaceTransaction;
    if (Option.isSome(current)) {
      yield* Effect.forEach(
        normalizedTargets(current.value.path, args.targets),
        (target) => protectInContext(current.value, target),
        { discard: true },
      );
      const value = yield* args.transition;
      yield* args.validate(value);
      return value;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspaceDir = path.resolve(args.workspaceDir);
    const workspaceExisted = yield* fs
      .exists(workspaceDir)
      .pipe(
        Effect.mapError((error) =>
          transactionError(`Failed to inspect workspace state directory ${workspaceDir}`, error),
        ),
      );

    return yield* args.semaphore.withPermits(1)(
      Effect.gen(function* () {
        yield* fs
          .makeDirectory(workspaceDir, { recursive: true })
          .pipe(
            Effect.mapError((error) =>
              transactionError(`Failed to create workspace state directory ${workspaceDir}`, error),
            ),
          );
        const scratchDir = path.join(workspaceDir, "tmp");
        yield* fs
          .makeDirectory(scratchDir, { recursive: true })
          .pipe(
            Effect.mapError((error) =>
              transactionError(`Failed to create workspace scratch directory ${scratchDir}`, error),
            ),
          );
        const lockPath = path.join(scratchDir, TRANSACTION_LOCK_FILENAME);
        const removeEmptyScratch = fs.readDirectory(scratchDir).pipe(
          Effect.flatMap((entries) =>
            entries.length === 0
              ? fs.remove(scratchDir, { recursive: true, force: false })
              : Effect.void,
          ),
          Effect.ignore,
        );
        const removeNewEmptyWorkspace = workspaceExisted
          ? Effect.void
          : fs.readDirectory(workspaceDir).pipe(
              Effect.flatMap((entries) =>
                entries.length === 0
                  ? fs.remove(workspaceDir, { recursive: true, force: false })
                  : Effect.void,
              ),
              Effect.ignore,
            );
        return yield* Effect.scoped(
          Effect.gen(function* () {
            // The invocation-level transition hold already provides
            // cross-process exclusion; acquiring here again would deadlock on
            // our own lock.
            if (!isWorkspaceTransitionHeldByThisInvocation(workspaceDir)) {
              yield* acquireWorkspaceLock(workspaceDir, lockPath, removeEmptyScratch);
            }
            const backupDir = yield* fs
              .makeTempDirectory({ prefix: "axm-workspace-rollback-" })
              .pipe(
                Effect.mapError((error) =>
                  transactionError("Failed to create workspace rollback backup", error),
                ),
              );
            const context: WorkspaceTransactionContext = {
              backupDir,
              fs,
              path,
              protectedTargets: new Set(),
              snapshots: [],
              snapshotSemaphore: Semaphore.makeUnsafe(1),
            };
            const cleanup = fs
              .remove(backupDir, { recursive: true })
              .pipe(
                Effect.mapError((error) =>
                  transactionError(
                    `Failed to remove workspace rollback backup ${backupDir}`,
                    error,
                  ),
                ),
              );
            const business = Effect.gen(function* () {
              yield* Effect.forEach(
                normalizedTargets(path, args.targets),
                (target) => protectInContext(context, target),
                { discard: true },
              );
              const value = yield* args.transition;
              yield* args.validate(value);
              return value;
            }).pipe(
              Effect.provideService(CurrentWorkspaceTransaction, Option.some(context)),
              Effect.interruptible,
            );

            return yield* business.pipe(
              Effect.matchCauseEffect({
                onFailure: (cause) =>
                  (args.onRestorationStarted ?? Effect.void)
                    .pipe(Effect.andThen(restoreAll(fs, path, context.snapshots)))
                    .pipe(
                      Effect.matchEffect({
                        onFailure: (rollbackCause) =>
                          writeOperationRecoveryRecord({
                            workspaceDir,
                            kind: "restoration-failure",
                            command: "workspace-transaction",
                            retained: [
                              backupDir,
                              ...context.snapshots.map((snapshot) => snapshot.target),
                            ],
                            resolveBy: `Restore the affected paths from the retained rollback backup at ${backupDir}, then re-run the operation.`,
                          }).pipe(
                            Effect.provide(
                              Layer.mergeAll(
                                Layer.succeed(FileSystem.FileSystem, fs),
                                Layer.succeed(Path.Path, path),
                              ),
                            ),
                            Effect.andThen(
                              Effect.fail(
                                transactionError(
                                  `Workspace rollback failed. Rollback backup retained at: ${backupDir}`,
                                  { transition: Cause.pretty(cause), rollback: rollbackCause },
                                ),
                              ),
                            ),
                          ),
                        onSuccess: () => cleanup.pipe(Effect.andThen(Effect.failCause(cause))),
                      }),
                    ),
                onSuccess: (value) => cleanup.pipe(Effect.as(value)),
              }),
              Effect.uninterruptible,
            );
          }),
        ).pipe(Effect.ensuring(removeEmptyScratch), Effect.ensuring(removeNewEmptyWorkspace));
      }),
    );
  });
