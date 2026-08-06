import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Semaphore from "effect/Semaphore";

import { makeAppError, type AppError } from "../app-error/index.js";

const TRANSACTION_LOCK_FILENAME = "workspace-transition.lock";
const LOCK_RETRY_DELAY = Duration.millis(25);
const LOCK_RETRY_LIMIT = 200;

const transactionSemaphores = new Map<string, Semaphore.Semaphore>();

const semaphoreFor = (workspaceDir: string): Semaphore.Semaphore => {
  const current = transactionSemaphores.get(workspaceDir);
  if (current !== undefined) return current;
  const created = Semaphore.makeUnsafe(1);
  transactionSemaphores.set(workspaceDir, created);
  return created;
};

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

export interface WorkspaceTransactionArgs<A, R> {
  readonly workspaceDir: string;
  /** Authoritative files or directories that the transition may mutate. */
  readonly targets: ReadonlyArray<string>;
  /** Desired, trust, canonical, projection, and native-configuration mutation. */
  readonly transition: Effect.Effect<A, AppError, R>;
  /** Confirms the complete durable postcondition before receipt history is written. */
  readonly validate: (value: A) => Effect.Effect<void, AppError, R>;
  /** Optional non-authoritative receipt write, performed after the postcondition is valid. */
  readonly receipt?: (value: A) => Effect.Effect<void, AppError, R>;
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

const acquireFileLock = (
  fs: FileSystem.FileSystem,
  lockPath: string,
  attempts = 0,
): Effect.Effect<void, AppError> =>
  fs.writeFileString(lockPath, "locked\n", { flag: "wx" }).pipe(
    Effect.catch((error) => {
      if (error.reason._tag !== "AlreadyExists") {
        return Effect.fail(
          transactionError(`Failed to acquire workspace transaction lock at ${lockPath}`, error),
        );
      }
      if (attempts >= LOCK_RETRY_LIMIT) {
        return Effect.fail(
          makeAppError({
            code: "conflict",
            detail: `Another workspace mutation holds the transaction lock at ${lockPath}`,
            cause: error,
          }),
        );
      }
      return Effect.sleep(LOCK_RETRY_DELAY).pipe(
        Effect.andThen(acquireFileLock(fs, lockPath, attempts + 1)),
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
  Effect.forEach([...snapshots].reverse(), (snapshot) => restoreSnapshot(fs, path, snapshot), {
    discard: true,
  });

const receiptFailure = (error: AppError): AppError =>
  makeAppError({
    code: error.code,
    title: error.title,
    detail: `Workspace transition completed, but receipt history could not be written: ${error.detail}`,
    ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error,
  });

/**
 * Run one coupled workspace mutation under a scope-local lock.
 *
 * Every authoritative target is snapshotted before the transition begins. A
 * failed transition or postcondition check restores the exact pre-operation
 * paths. Receipt history is deliberately outside that rollback boundary.
 */
export const runWorkspaceTransaction = <A, R>(
  args: WorkspaceTransactionArgs<A, R>,
): Effect.Effect<A, AppError, R | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspaceDir = path.resolve(args.workspaceDir);
    const semaphore = semaphoreFor(workspaceDir);

    return yield* semaphore.withPermits(1)(
      Effect.gen(function* () {
        yield* fs
          .makeDirectory(workspaceDir, { recursive: true })
          .pipe(
            Effect.mapError((error) =>
              transactionError(`Failed to create workspace state directory ${workspaceDir}`, error),
            ),
          );
        const lockPath = path.join(workspaceDir, TRANSACTION_LOCK_FILENAME);
        return yield* Effect.acquireUseRelease(
          acquireFileLock(fs, lockPath),
          () =>
            Effect.gen(function* () {
              const backupDir = yield* fs
                .makeTempDirectory({ prefix: "axm-workspace-recovery-" })
                .pipe(
                  Effect.mapError((error) =>
                    transactionError("Failed to create workspace recovery backup", error),
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
                      `Failed to remove workspace recovery backup ${backupDir}`,
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
                    restoreAll(fs, path, context.snapshots).pipe(
                      Effect.matchEffect({
                        onFailure: (rollbackCause) =>
                          Effect.fail(
                            transactionError(
                              `Workspace recovery is required after rollback failed. Recovery backup retained at: ${backupDir}`,
                              { transition: Cause.pretty(cause), rollback: rollbackCause },
                            ),
                          ),
                        onSuccess: () => cleanup.pipe(Effect.andThen(Effect.failCause(cause))),
                      }),
                    ),
                  onSuccess: (value) =>
                    cleanup.pipe(
                      Effect.andThen(
                        args.receipt === undefined
                          ? Effect.succeed(value)
                          : args
                              .receipt(value)
                              .pipe(
                                Effect.mapError(receiptFailure),
                                Effect.as(value),
                                Effect.interruptible,
                              ),
                      ),
                    ),
                }),
                Effect.uninterruptible,
              );
            }),
          (_, exit) => {
            const release = fs
              .remove(lockPath, { force: true })
              .pipe(
                Effect.mapError((error) =>
                  transactionError(
                    `Failed to release workspace transaction lock ${lockPath}`,
                    error,
                  ),
                ),
              );
            return Exit.isFailure(exit)
              ? release.pipe(
                  Effect.tapError((error) => Effect.logError(error.detail)),
                  Effect.ignore,
                )
              : release;
          },
        );
      }),
    );
  });
