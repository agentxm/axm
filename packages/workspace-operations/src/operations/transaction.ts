/**
 * Workspace transaction mechanics: the snapshot/restore/validate/rollback
 * runner and the closure settlement operations, implemented against the
 * ambient authority context declared in `../transaction.ts`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { createHash, randomBytes } from "node:crypto";

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Semaphore from "effect/Semaphore";

import { recordFootprint } from "@agentxm/workspace-state";
import {
  CurrentWorkspaceClosure,
  CurrentWorkspaceTransaction,
  protectInContext,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceTransitionCompromised,
  type Snapshot,
  type WorkspaceTransactionContext,
  type WorkspaceTransactionFailure,
} from "@agentxm/workspace-state";
import {
  acquireWorkspaceTransitionLock,
  heldWorkspaceTransition,
  isWorkspaceTransitionHeldByThisInvocation,
} from "./transition-lock.js";

/** Run one semantic closure's mutations under its closure identity. */
export const withWorkspaceClosure =
  (closureId: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(Effect.provideService(CurrentWorkspaceClosure, closureId));

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

const workspaceRelative = (path: Path.Path, workspaceDir: string, target: string): string => {
  const relative = path.relative(path.dirname(workspaceDir), target);
  return relative.startsWith("..") ? target : relative;
};

const sha256 = (input: string | Uint8Array): string =>
  createHash("sha256").update(input).digest("hex");

/**
 * Deterministic content hash of a path's current state: file bytes, symlink
 * target, recursive directory listing, or the literal `absent`.
 */
const hashPathState = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const link = yield* fs.readLink(target).pipe(Effect.option);
    if (Option.isSome(link)) return sha256(`symlink:${link.value}`);
    const exists = yield* fs.exists(target);
    if (!exists) return "absent";
    const info = yield* fs.stat(target);
    if (info.type === "Directory") {
      const entries = [...(yield* fs.readDirectory(target))].sort();
      const parts: Array<string> = [];
      for (const entry of entries) {
        const child = yield* hashPathState(fs, path, path.join(target, entry));
        parts.push(`${entry}:${child}`);
      }
      return sha256(`dir:${parts.join("\n")}`);
    }
    const bytes = yield* fs.readFile(target);
    return sha256(bytes);
  }).pipe(Effect.catch(() => Effect.succeed("unhashable")));

const dropClosureSnapshots = (context: WorkspaceTransactionContext, closureId: string): void => {
  let index = context.snapshots.length;
  while (index > 0) {
    index -= 1;
    if (context.snapshots[index]?.closure === closureId) {
      context.snapshots.splice(index, 1);
    }
  }
  context.protectedTargets.delete(closureId);
};

/**
 * Settle one closure: its commits stand, so its snapshots leave the
 * restoration set and a later closure touching the same target takes a fresh
 * post-commit preimage. No-op outside a transaction.
 */
export const settleWorkspaceClosure = (closureId: string): Effect.Effect<void> =>
  CurrentWorkspaceTransaction.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (context) =>
          context.snapshotSemaphore.withPermits(1)(
            Effect.sync(() => {
              dropClosureSnapshots(context, closureId);
            }),
          ),
      }),
    ),
  );

/**
 * Roll back one failed closure: restore and verify exactly its snapshots, in
 * reverse order, leaving every other closure's work in place. A restoration
 * that does not complete and verify records a pending typed failure the
 * transaction surfaces at its end — the truth travels in memory, never
 * through a later workspace write. No-op outside a transaction.
 */
export const rollbackWorkspaceClosure = (closureId: string): Effect.Effect<void> =>
  CurrentWorkspaceTransaction.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (context) =>
          context.snapshotSemaphore.withPermits(1)(
            Effect.gen(function* () {
              const { fs, path } = context;
              const owned = context.snapshots.filter((snapshot) => snapshot.closure === closureId);
              if (owned.length === 0) {
                dropClosureSnapshots(context, closureId);
                return;
              }
              const held = heldWorkspaceTransition(path.resolve(context.workspaceDir));
              const transitionCompromised = held === undefined ? () => false : held.isCompromised;
              yield* restoreAll(fs, path, owned, transitionCompromised).pipe(
                Effect.andThen(verifySnapshots(fs, path, owned)),
                Effect.matchEffect({
                  onFailure: (restorationCause) =>
                    Effect.sync(() => {
                      context.pendingRestorationFailures.push({
                        closureId,
                        restorationCause,
                        retained: owned.map((snapshot) =>
                          workspaceRelative(path, context.workspaceDir, snapshot.target),
                        ),
                      });
                    }),
                  onSuccess: () => Effect.void,
                }),
              );
              dropClosureSnapshots(context, closureId);
            }),
          ),
      }),
    ),
  );

/** Whether anything occupies the path: a file, directory, or (broken) symlink. */
const pathPresent = (
  fs: FileSystem.FileSystem,
  target: string,
): Effect.Effect<boolean, PlatformError> =>
  fs.readLink(target).pipe(
    Effect.map(() => true),
    Effect.catch(() => fs.exists(target)),
  );

/**
 * Restore one snapshot through validated staging and atomic publication.
 * The restored content is fully staged and validated in an owned
 * `<target>.tmp.<unique>` sibling before a rename publishes it, so abrupt
 * termination — including a forced process exit — can never expose a
 * partially restored target: the authoritative path holds the failure-time
 * content, the restored content, or (for a directory swap only, between two
 * renames) nothing, never a partial tree. The target path itself is never
 * removed; only owned `.tmp.` siblings are.
 */
const restoreSnapshot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshot: Snapshot,
): Effect.Effect<void, PlatformError | WorkspaceRestorationError> =>
  Effect.gen(function* () {
    if (snapshot.state === "absent") {
      if (!(yield* pathPresent(fs, snapshot.target))) return;
      // Publishing absence is one rename: the mutated tree leaves the
      // authoritative path atomically, then the owned trash is removed.
      const trash = `${snapshot.target}.tmp.${randomBytes(6).toString("hex")}`;
      yield* fs.rename(snapshot.target, trash);
      yield* fs.remove(trash, { recursive: true, force: true }).pipe(Effect.ignore);
      return;
    }
    yield* fs.makeDirectory(path.dirname(snapshot.target), { recursive: true });
    const staging = `${snapshot.target}.tmp.${randomBytes(6).toString("hex")}`;
    yield* Effect.gen(function* () {
      if (snapshot.state === "symlink") {
        yield* fs.symlink(snapshot.linkTarget, staging);
        const staged = yield* fs.readLink(staging);
        if (staged !== snapshot.linkTarget) {
          return yield* new WorkspaceRestorationError({
            target: snapshot.target,
            step: "stage",
            cause: { staged, expected: snapshot.linkTarget },
          });
        }
      } else {
        yield* fs.copy(snapshot.backup, staging, { preserveTimestamps: true });
        const stagedHash = yield* hashPathState(fs, path, staging);
        const backupHash = yield* hashPathState(fs, path, snapshot.backup);
        if (stagedHash !== backupHash || stagedHash === "unhashable") {
          return yield* new WorkspaceRestorationError({
            target: snapshot.target,
            step: "stage",
            cause: { stagedHash, backupHash },
          });
        }
      }
      const targetLink = yield* fs.readLink(snapshot.target).pipe(Effect.option);
      const targetInfo = Option.isSome(targetLink)
        ? Option.none<FileSystem.File.Info>()
        : yield* fs.stat(snapshot.target).pipe(Effect.option);
      const targetPresent = Option.isSome(targetLink) || Option.isSome(targetInfo);
      const targetIsDirectory = Option.exists(targetInfo, (info) => info.type === "Directory");
      const stagedIsDirectory =
        snapshot.state === "copied" && (yield* fs.stat(staging)).type === "Directory";
      if (!targetPresent || (!targetIsDirectory && !stagedIsDirectory)) {
        // rename atomically replaces a file or symlink target.
        yield* fs.rename(staging, snapshot.target);
        return;
      }
      // A directory is swapped through two renames of owned names; the
      // moved-aside content is intact in the trash sibling until removal.
      const trash = `${snapshot.target}.tmp.${randomBytes(6).toString("hex")}`;
      yield* fs.rename(snapshot.target, trash);
      yield* fs.rename(staging, snapshot.target);
      yield* fs.remove(trash, { recursive: true, force: true }).pipe(Effect.ignore);
    }).pipe(
      Effect.onError(() =>
        fs.remove(staging, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
    );
  });

const restoreAll = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
  transitionCompromised: () => boolean,
): Effect.Effect<void, PlatformError | WorkspaceRestorationError> =>
  Effect.forEach(
    [...snapshots].reverse(),
    (snapshot) =>
      Effect.suspend((): Effect.Effect<void, PlatformError | WorkspaceRestorationError> =>
        // Restoration is a durable write like any other: once lock ownership
        // is lost it must stop, or it could overwrite a successor's work.
        transitionCompromised()
          ? Effect.fail(
              new WorkspaceRestorationError({
                target: snapshot.target,
                step: "stopped",
                cause: undefined,
              }),
            )
          : restoreSnapshot(fs, path, snapshot).pipe(
              Effect.andThen(recordFootprint({ path: snapshot.target, change: "restored" })),
            ),
      ),
    {
      discard: true,
    },
  );

const verifySnapshots = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
): Effect.Effect<void, WorkspaceRestorationError> =>
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
          return yield* new WorkspaceRestorationError({
            target: snapshot.target,
            step: "verify",
            cause: { state: snapshot.state },
          });
        }
      }),
    { discard: true },
  );

/**
 * Run one coupled workspace mutation under the workspace transition lock.
 *
 * Every authoritative target is snapshotted into a uniquely prefixed
 * OS-temporary directory before the transition begins. A failed transition or
 * postcondition check restores and verifies the exact pre-operation paths and
 * removes the snapshots; a restoration that does not complete and verify
 * fails with the typed {@link WorkspaceRestorationIncomplete}, preserving the
 * snapshot directory for manual inspection. Nothing about a failure persists
 * in the workspace: the next mutation plans from the current workspace state.
 *
 * The invocation-level transition hold is reused when a plan-family apply
 * already acquired it; otherwise this transaction acquires its own for the
 * duration of the mutation.
 */
export const runWorkspaceTransaction = <A, E, R>(
  args: WorkspaceTransactionArgs<A, E, R>,
): Effect.Effect<
  A,
  WorkspaceTransactionFailure | WorkspaceRestorationIncomplete | E,
  R | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const current = yield* CurrentWorkspaceTransaction;
    if (Option.isSome(current)) {
      const activeClosure = yield* CurrentWorkspaceClosure;
      yield* Effect.forEach(
        normalizedTargets(current.value.path, args.targets),
        (target) => protectInContext(current.value, target, activeClosure),
        { discard: true },
      );
      const value = yield* args.transition;
      yield* args.validate(value);
      return value;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspaceDir = path.resolve(args.workspaceDir);
    const missingWorkspaceAncestors: Array<string> = [];
    let ancestor = workspaceDir;
    while (true) {
      const exists = yield* fs
        .exists(ancestor)
        .pipe(
          Effect.mapError(
            (cause) => new WorkspaceDirectoryError({ path: ancestor, step: "inspect", cause }),
          ),
        );
      if (exists) break;
      missingWorkspaceAncestors.push(ancestor);
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }

    return yield* args.semaphore.withPermits(1)(
      Effect.gen(function* () {
        yield* fs
          .makeDirectory(workspaceDir, { recursive: true })
          .pipe(
            Effect.mapError(
              (cause) => new WorkspaceDirectoryError({ path: workspaceDir, step: "create", cause }),
            ),
          );
        const scratchDir = path.join(workspaceDir, "tmp");
        const removeEmptyScratch = fs.readDirectory(scratchDir).pipe(
          Effect.flatMap((entries) =>
            entries.length === 0
              ? fs.remove(scratchDir, { recursive: true, force: false })
              : Effect.void,
          ),
          Effect.ignore,
        );
        const removeNewEmptyWorkspace = Effect.forEach(
          missingWorkspaceAncestors,
          (directory) =>
            fs.readDirectory(directory).pipe(
              Effect.flatMap((entries) =>
                entries.length === 0
                  ? fs.remove(directory, { recursive: true, force: false })
                  : Effect.void,
              ),
              Effect.ignore,
            ),
          { concurrency: 1, discard: true },
        );
        return yield* Effect.scoped(
          Effect.gen(function* () {
            // The invocation-level transition hold already provides
            // cross-process exclusion; acquiring here again would deadlock on
            // our own lock.
            if (!isWorkspaceTransitionHeldByThisInvocation(workspaceDir)) {
              const contention = yield* acquireWorkspaceTransitionLock({
                workspaceDir,
                holder: { command: "workspace-transaction", pid: process.pid },
              });
              if (Option.isSome(contention)) {
                return yield* new TransitionLockUnavailable({
                  holder: Option.getOrUndefined(contention.value.holder),
                  waitedMillis: contention.value.waitedMillis,
                });
              }
            }
            const context: WorkspaceTransactionContext = {
              fs,
              path,
              workspaceDir,
              snapshotStore: { dir: undefined },
              protectedTargets: new Map(),
              snapshots: [],
              snapshotSemaphore: Semaphore.makeUnsafe(1),
              pendingRestorationFailures: [],
              snapshotSequence: { value: 0 },
            };
            // The store is removed only when nothing in it is still needed:
            // a closure whose rollback failed leaves its pre-change
            // snapshots preserved for manual recovery, and the typed
            // restoration fact names this directory.
            const removeSnapshotStore = Effect.suspend(() =>
              context.snapshotStore.dir === undefined ||
              context.pendingRestorationFailures.length > 0
                ? Effect.void
                : fs
                    .remove(context.snapshotStore.dir, { recursive: true, force: true })
                    .pipe(Effect.ignore),
            );
            // The compromise signal of the hold serializing this mutation:
            // the invocation-level hold when one exists, else the one just
            // acquired above. Mutation races against it and stops when
            // ownership is lost.
            const held = heldWorkspaceTransition(workspaceDir);
            // Interruptible like the business side: the race runs inside the
            // uninterruptible rollback guard, and its loser must be
            // interruptible for the race to settle.
            const compromiseSignal = (held === undefined ? Effect.never : held.compromised).pipe(
              Effect.interruptible,
            );
            const transitionCompromised = held === undefined ? () => false : held.isCompromised;
            const business = Effect.gen(function* () {
              // The transaction's own declared targets belong to the
              // operation closure: no semantic closure is active yet.
              yield* Effect.forEach(
                normalizedTargets(path, args.targets),
                (target) => protectInContext(context, target, undefined),
                { discard: true },
              );
              const value = yield* args.transition;
              yield* args.validate(value);
              return value;
            }).pipe(
              Effect.provideService(CurrentWorkspaceTransaction, Option.some(context)),
              Effect.interruptible,
            );

            const retainAll = (cause: Cause.Cause<unknown>, restorationCause: unknown) =>
              Effect.gen(function* () {
                const interruption = Cause.hasInterruptsOnly(cause);
                return yield* new WorkspaceRestorationIncomplete({
                  terminationCause: interruption ? "interruption" : "failure",
                  transitionCause: cause,
                  restorationCause,
                  snapshotDir: context.snapshotStore.dir,
                  retained: context.snapshots.map((snapshot) =>
                    workspaceRelative(path, workspaceDir, snapshot.target),
                  ),
                });
              });

            // The mask/restore shape is load-bearing: the business runs in
            // the restored (interruptible) region so an external termination
            // request reaches it, while the settlement handlers — rollback,
            // verification, and the typed retain path — run uninterruptibly
            // and observe the interruption as a cause. A blanket mask would
            // never deliver the interrupt to the parked business and the
            // invocation could not stop.
            return yield* Effect.uninterruptibleMask((restoreInterruptibility) =>
              restoreInterruptibility(Effect.raceFirst(business, compromiseSignal)).pipe(
                Effect.matchCauseEffect({
                  onFailure: (cause) => {
                    const raceError = Option.getOrUndefined(Cause.findErrorOption(cause));
                    if (raceError instanceof WorkspaceTransitionCompromised) {
                      // Ownership is lost: restoring now could overwrite a
                      // successor's work. Retain everything the failure left,
                      // keep the snapshots, and fail typed.
                      return retainAll(cause, raceError);
                    }
                    return (args.onRestorationStarted ?? Effect.void)
                      .pipe(
                        Effect.andThen(
                          restoreAll(fs, path, context.snapshots, transitionCompromised),
                        ),
                        Effect.andThen(verifySnapshots(fs, path, context.snapshots)),
                      )
                      .pipe(
                        Effect.matchEffect({
                          onFailure: (restorationCause) => retainAll(cause, restorationCause),
                          onSuccess: () =>
                            removeSnapshotStore.pipe(Effect.andThen(Effect.failCause(cause))),
                        }),
                      );
                  },
                  onSuccess: (value) => removeSnapshotStore.pipe(Effect.as(value)),
                }),
              ),
            );
          }),
        ).pipe(Effect.ensuring(removeEmptyScratch), Effect.ensuring(removeNewEmptyWorkspace));
      }),
    );
  });
