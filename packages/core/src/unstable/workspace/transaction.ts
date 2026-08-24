import { randomBytes } from "node:crypto";

import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Semaphore from "effect/Semaphore";
import * as lockfile from "proper-lockfile";

import { makeAppError, type AppError } from "../app-error/index.js";
import { recordFootprint } from "./footprint-recorder.js";
import {
  appendCapsuleEntry,
  capsuleEntryPath,
  createRecoveryCapsule,
  hashPathState,
  nextCapsuleArtifact,
  removeRecoveryCapsule,
  sealRecoveryCapsule,
  type CapsuleEntry,
  type CapsuleWriter,
} from "./recovery-capsule.js";
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
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceDir: string;
  readonly identity: WorkspaceTransactionIdentity;
  readonly capsule: { writer: CapsuleWriter | undefined };
  readonly protectedTargets: Set<string>;
  readonly snapshots: Array<Snapshot>;
  readonly snapshotSemaphore: Semaphore.Semaphore;
}

const CurrentWorkspaceTransaction = ServiceMap.Reference<
  Option.Option<WorkspaceTransactionContext>
>("@agentxm/client-core/unstable/workspace/CurrentWorkspaceTransaction", {
  defaultValue: () => Option.none(),
});

/** Names the capsule this transaction snapshots into, and the command it serves. */
export interface WorkspaceTransactionIdentity {
  /** Capsule directory name; plan-family passes the candidate identity. */
  readonly capsuleId: string;
  readonly command: string;
}

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
  /** Capsule identity; omitted callers snapshot under a per-run capsule name. */
  readonly identity?: WorkspaceTransactionIdentity;
}

/**
 * Restoration did not complete: the typed fact the terminal resolution
 * derives outcome, disposition, recovery requirement, and exit status from.
 * The capsule referenced here persists with the snapshots already on disk.
 */
export class WorkspaceRestorationIncomplete extends Data.TaggedError(
  "WorkspaceRestorationIncomplete",
)<{
  readonly terminationCause: "failure" | "interruption";
  readonly transitionCause: Cause.Cause<unknown>;
  readonly restorationCause: unknown;
  readonly capsuleDir: string;
  /** Workspace-relative capsule location, safe for machine-document values. */
  readonly capsulePath: string;
  readonly retained: ReadonlyArray<string>;
  readonly sealed: boolean;
}> {}

/** Render the typed restoration failure for boundaries without a resolution. */
export const restorationIncompleteToAppError = (error: WorkspaceRestorationIncomplete): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Workspace restoration did not complete; retained state and its snapshots are preserved in the recovery capsule at ${error.capsulePath}.`,
    cause: {
      transition: Cause.pretty(error.transitionCause),
      restoration: error.restorationCause,
    },
    suggestions: [
      {
        description:
          "Re-run the command with --resolve-recovery restore to restore the retained paths from their snapshots.",
      },
      {
        description:
          "Re-run the command with --resolve-recovery accept to accept the retained state as it stands.",
      },
    ],
  });

/**
 * Surface the typed restoration failure as its AppError rendering at a
 * boundary whose error contract is AppError. Inside a plan-family apply this
 * is type-satisfaction only: nested transactions reuse the outer snapshot
 * store and never fail restoration themselves.
 */
export const surfaceRestorationIncomplete = <A, E, R>(
  effect: Effect.Effect<A, E | WorkspaceRestorationIncomplete, R>,
): Effect.Effect<A, E | AppError, R> =>
  effect.pipe(
    Effect.catchIf(
      (error): error is WorkspaceRestorationIncomplete =>
        error instanceof WorkspaceRestorationIncomplete,
      (error) => Effect.fail(restorationIncompleteToAppError(error)),
    ),
  );

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

const protectInContext = (
  context: WorkspaceTransactionContext,
  target: string,
): Effect.Effect<void, AppError> =>
  context.snapshotSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const { fs, path } = context;
      const normalized = path.resolve(target);
      if (context.protectedTargets.has(normalized)) return;
      if (context.capsule.writer === undefined) {
        context.capsule.writer = yield* createRecoveryCapsule({
          fs,
          path,
          workspaceDir: context.workspaceDir,
          capsuleId: context.identity.capsuleId,
          command: context.identity.command,
        });
      }
      const writer = context.capsule.writer;
      const relative = capsuleEntryPath(path, writer, normalized);
      const link = yield* fs.readLink(normalized).pipe(Effect.option);
      let entry: CapsuleEntry;
      let snapshot: Snapshot;
      if (Option.isSome(link)) {
        entry = { path: relative, preState: "symlink", linkTarget: link.value };
        snapshot = { target: normalized, state: "symlink", linkTarget: link.value };
      } else {
        const exists = yield* fs
          .exists(normalized)
          .pipe(
            Effect.mapError((error) =>
              transactionError(`Failed to inspect transaction target ${normalized}`, error),
            ),
          );
        if (!exists) {
          entry = { path: relative, preState: "absent" };
          snapshot = { target: normalized, state: "absent" };
        } else {
          const artifact = nextCapsuleArtifact(path, writer);
          yield* fs
            .copy(normalized, artifact, { preserveTimestamps: true })
            .pipe(
              Effect.mapError((error) =>
                transactionError(`Failed to snapshot transaction target ${normalized}`, error),
              ),
            );
          entry = { path: relative, preState: "copied", snapshot: path.basename(artifact) };
          snapshot = { target: normalized, state: "copied", backup: artifact };
        }
      }
      // The entry is durably recorded before the path is first mutated; a
      // path whose entry cannot be recorded is never mutated.
      yield* appendCapsuleEntry(fs, path, writer, entry);
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

const verifySnapshots = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
): Effect.Effect<void, AppError> =>
  Effect.forEach(
    snapshots,
    (snapshot) =>
      Effect.gen(function* () {
        const verified = yield* Effect.gen(function* () {
          if (snapshot.state === "absent") {
            return !(yield* fs.exists(snapshot.target));
          }
          if (snapshot.state === "symlink") {
            const link = yield* fs.readLink(snapshot.target).pipe(Effect.option);
            return Option.exists(link, (value) => value === snapshot.linkTarget);
          }
          const restored = yield* hashPathState(fs, path, snapshot.target);
          const backup = yield* hashPathState(fs, path, snapshot.backup);
          return restored === backup && restored !== "unhashable";
        }).pipe(Effect.catch(() => Effect.succeed(false)));
        if (!verified) {
          return yield* transactionError(
            `Workspace restoration did not verify for ${snapshot.target}`,
            { state: snapshot.state },
          );
        }
      }),
    { discard: true },
  );

/**
 * Run one coupled workspace mutation under a scope-local lock.
 *
 * Every authoritative target is snapshotted into the recovery capsule before
 * the transition begins. A failed transition or postcondition check restores
 * and verifies the exact pre-operation paths and removes the capsule; a
 * restoration that does not complete and verify fails with the typed
 * {@link WorkspaceRestorationIncomplete}, leaving the sealed capsule as the
 * only surviving recovery state. The lock is held by the operating system and
 * released on descriptor close or process death.
 */
export const runWorkspaceTransaction = <A, E, R>(
  args: WorkspaceTransactionArgs<A, E, R>,
): Effect.Effect<
  A,
  AppError | WorkspaceRestorationIncomplete | E,
  R | FileSystem.FileSystem | Path.Path
> =>
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
            const context: WorkspaceTransactionContext = {
              fs,
              path,
              workspaceDir,
              identity: args.identity ?? {
                capsuleId: `workspace-transaction-${randomBytes(4).toString("hex")}`,
                command: "workspace-transaction",
              },
              capsule: { writer: undefined },
              protectedTargets: new Set(),
              snapshots: [],
              snapshotSemaphore: Semaphore.makeUnsafe(1),
            };
            const removeCapsuleIfAny = Effect.suspend(() =>
              context.capsule.writer === undefined
                ? Effect.void
                : removeRecoveryCapsule(fs, path, workspaceDir, context.capsule.writer.dir),
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
                    .pipe(
                      Effect.andThen(restoreAll(fs, path, context.snapshots)),
                      Effect.andThen(verifySnapshots(fs, path, context.snapshots)),
                    )
                    .pipe(
                      Effect.matchEffect({
                        onFailure: (restorationCause) =>
                          Effect.gen(function* () {
                            const writer = context.capsule.writer;
                            const interruption = Cause.hasInterruptsOnly(cause);
                            const sealed =
                              writer === undefined
                                ? false
                                : yield* sealRecoveryCapsule(
                                    fs,
                                    path,
                                    writer,
                                    interruption ? "interruption" : "failure",
                                  );
                            const capsuleDir = writer?.dir ?? scratchDir;
                            return yield* new WorkspaceRestorationIncomplete({
                              terminationCause: interruption ? "interruption" : "failure",
                              transitionCause: cause,
                              restorationCause,
                              capsuleDir,
                              capsulePath: path.relative(path.dirname(workspaceDir), capsuleDir),
                              retained: (writer?.entries ?? []).map((entry) => entry.path),
                              sealed,
                            });
                          }),
                        onSuccess: () =>
                          removeCapsuleIfAny.pipe(Effect.andThen(Effect.failCause(cause))),
                      }),
                    ),
                onSuccess: (value) => removeCapsuleIfAny.pipe(Effect.as(value)),
              }),
              Effect.uninterruptible,
            );
          }),
        ).pipe(Effect.ensuring(removeEmptyScratch), Effect.ensuring(removeNewEmptyWorkspace));
      }),
    );
  });
