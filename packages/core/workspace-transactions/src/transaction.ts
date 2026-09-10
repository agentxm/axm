/**
 * Workspace transaction mechanics: the snapshot/restore/validate/rollback
 * runner and the closure settlement operations, implemented against the
 * package-private context declared in `./context.ts`.
 *
 * `runWorkspaceTransaction`, the closure API, and the runner binding are
 * the only ways in: every transition of the ledger happens here or in the
 * registration primitives, under one serialized reference.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SynchronizedRef from "effect/SynchronizedRef";

import {
  CurrentWorkspaceClosure,
  CurrentWorkspaceTransaction,
  protectInContext,
  type WorkspaceTransactionContext,
} from "./context.js";
import {
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationIncomplete,
  WorkspaceTransitionCompromised,
  type WorkspaceTransactionFailure,
} from "./errors.js";
import {
  closureSnapshots,
  emptyLedger,
  withPendingRestoration,
  withoutClosure,
  type PendingClosureRestoration,
} from "./ledger.js";
import {
  normalizedTargets,
  restoreAll,
  verifySnapshots,
  workspaceRelative,
} from "./restoration.js";
import { WorkspaceTransactionScope } from "./scope.js";

export interface WorkspaceTransactionArgs<A, E = never, R = never> {
  /** Authoritative files or directories that the transition may mutate. */
  readonly targets?: ReadonlyArray<string>;
  /** Desired, lock, canonical, projection, and native-configuration mutation. */
  readonly transition: Effect.Effect<A, E, R>;
  /** Confirms the complete durable postcondition before the transaction commits. */
  readonly validate: (value: A) => Effect.Effect<void, E, R>;
  /** Observes the start of rollback restoration; never controls it. */
  readonly onRestorationStarted?: Effect.Effect<void>;
  /**
   * When `false`, the transaction does not claim the shared settings and
   * lockfile targets up front. A closure-scoped plan apply passes `false`:
   * each closure protects the shared files at its own first touch, so a
   * closure's rollback restores only its own delta and never tears an
   * earlier closure's settled commit out of the shared files. Defaults to
   * `true` — a direct transaction is one closure and claims them itself.
   */
  readonly claimDefaultTargets?: boolean;
}

/**
 * The shape of a transaction runner with its scope and platform already
 * bound. Kept only for the `ExtensionManager.runTransaction` contract; see
 * {@link bindWorkspaceTransactionRunner}.
 */
export type WorkspaceTransactionRunner = <A, E = never, R = never>(
  args: WorkspaceTransactionArgs<A, E, R>,
) => Effect.Effect<A, WorkspaceTransactionFailure | WorkspaceRestorationIncomplete | E, R>;

// ---------------------------------------------------------------------------
// Closure API — consumed by workspace-operations only
// ---------------------------------------------------------------------------

/** Run one semantic closure's mutations under its closure identity. */
export const withWorkspaceClosure =
  (closureId: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(Effect.provideService(CurrentWorkspaceClosure, closureId));

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
          SynchronizedRef.update(context.ledger, (ledger) => withoutClosure(ledger, closureId)),
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
          SynchronizedRef.updateEffect(context.ledger, (ledger) =>
            Effect.gen(function* () {
              const { fs, path } = context;
              const owned = closureSnapshots(ledger, closureId);
              if (owned.length === 0) return withoutClosure(ledger, closureId);
              return yield* restoreAll(fs, path, owned, context.isTransitionCompromised).pipe(
                Effect.andThen(verifySnapshots(fs, path, owned)),
                Effect.match({
                  onFailure: (restorationCause) =>
                    withPendingRestoration(withoutClosure(ledger, closureId), {
                      closureId,
                      restorationCause,
                      retained: owned.map((snapshot) =>
                        workspaceRelative(path, context.workspaceDir, snapshot.target),
                      ),
                    }),
                  onSuccess: () => withoutClosure(ledger, closureId),
                }),
              );
            }),
          ),
      }),
    ),
  );

/**
 * Closure rollbacks that could not complete and verify, with the snapshot
 * store that still preserves their pre-change bytes. Read at the end of a
 * plan apply so the terminal resolution derives retained state from the
 * in-memory facts alone. `None` outside a transaction.
 */
export const pendingClosureRestorations: Effect.Effect<
  Option.Option<{
    readonly failures: ReadonlyArray<PendingClosureRestoration>;
    readonly snapshotDir: string | undefined;
  }>
> = CurrentWorkspaceTransaction.pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: (context) =>
        Effect.map(SynchronizedRef.get(context.ledger), (ledger) =>
          Option.some({ failures: ledger.pendingRestorations, snapshotDir: ledger.snapshotDir }),
        ),
    }),
  ),
);

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

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
 * already acquired it through this scope; otherwise this transaction acquires
 * its own for the duration of the mutation. A transaction started inside an
 * active transaction joins it: its targets are protected in the active
 * closure and its failure is the outer transaction's to restore.
 */
export const runWorkspaceTransaction = <A, E, R>(
  args: WorkspaceTransactionArgs<A, E, R>,
): Effect.Effect<
  A,
  WorkspaceTransactionFailure | WorkspaceRestorationIncomplete | E,
  R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const scope = yield* WorkspaceTransactionScope;
    const targets = [
      ...(args.claimDefaultTargets === false ? [] : [scope.settingsPath, scope.lockPath]),
      ...(args.targets ?? []),
    ];
    const current = yield* CurrentWorkspaceTransaction;
    if (Option.isSome(current)) {
      const activeClosure = yield* CurrentWorkspaceClosure;
      yield* Effect.forEach(
        normalizedTargets(current.value.path, targets),
        (target) => protectInContext(current.value, target, activeClosure),
        { discard: true },
      );
      const value = yield* args.transition;
      yield* args.validate(value);
      return value;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspaceDir = path.resolve(scope.workspaceDir);
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

    return yield* scope.admission.withPermits(1)(
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
            if (Option.isNone(yield* scope.lock.held(workspaceDir))) {
              const contention = yield* scope.lock.acquire({
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
            const held = Option.getOrUndefined(yield* scope.lock.held(workspaceDir));
            const ledger = yield* SynchronizedRef.make(emptyLedger);
            const context: WorkspaceTransactionContext = {
              isTransitionCompromised: held?.isCompromised ?? (() => false),
              fs,
              path,
              workspaceDir,
              ledger,
            };
            // The store is removed only when nothing in it is still needed:
            // a closure whose rollback failed leaves its pre-change
            // snapshots preserved for manual recovery, and the typed
            // restoration fact names this directory.
            const removeSnapshotStore = SynchronizedRef.get(ledger).pipe(
              Effect.flatMap((state) =>
                state.snapshotDir === undefined || state.pendingRestorations.length > 0
                  ? Effect.void
                  : fs
                      .remove(state.snapshotDir, { recursive: true, force: true })
                      .pipe(Effect.ignore),
              ),
            );
            // The compromise signal of the hold serializing this mutation:
            // the invocation-level hold when one exists, else the one just
            // acquired above. Mutation races against it and stops when
            // ownership is lost.

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
                normalizedTargets(path, targets),
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
                const state = yield* SynchronizedRef.get(ledger);
                const interruption = Cause.hasInterruptsOnly(cause);
                return yield* new WorkspaceRestorationIncomplete({
                  terminationCause: interruption ? "interruption" : "failure",
                  transitionCause: cause,
                  restorationCause,
                  snapshotDir: state.snapshotDir,
                  retained: state.snapshots.map((snapshot) =>
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
                        Effect.andThen(SynchronizedRef.get(ledger)),
                        Effect.flatMap((state) =>
                          restoreAll(fs, path, state.snapshots, transitionCompromised).pipe(
                            Effect.andThen(verifySnapshots(fs, path, state.snapshots)),
                          ),
                        ),
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

/**
 * TRANSITIONAL: a runner with the scope and platform of the current context
 * already bound, for the `ExtensionManager.runTransaction` contract whose
 * members must be `R = never`. Removed with that contract in the manager
 * dissolution slice; new code calls {@link runWorkspaceTransaction} and keeps
 * `WorkspaceTransactionScope` in `R`.
 */
export const bindWorkspaceTransactionRunner: Effect.Effect<
  WorkspaceTransactionRunner,
  never,
  WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path
> = Effect.gen(function* () {
  const scope = yield* WorkspaceTransactionScope;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const runner: WorkspaceTransactionRunner = (args) =>
    runWorkspaceTransaction(args).pipe(
      Effect.provideService(WorkspaceTransactionScope, scope),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
  return runner;
});
