/**
 * Workspace transaction mechanics: the snapshot/restore/validate/rollback
 * runner and the closure settlement operations, implemented against the
 * package-private context declared in `./context.ts`.
 *
 * `runWorkspaceTransaction` and the closure API are the only ways in: every
 * transition of the ledger happens here or in the registration primitives,
 * under one serialized reference.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Semaphore from "effect/Semaphore";
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
  WorkspaceRestorationError,
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
import type {
  WorkspaceTransactionArgs,
  WorkspaceTransactionPaths,
  WorkspaceTransactionScopeService,
} from "./scope.js";
import type { HeldWorkspaceTransition } from "./transition-lock.js";
import { assertNativeMutationWithin, type NativeAuthorityRootWitness } from "../locations/index.js";
import { cleanupRetirements, recoveryEntries } from "./retirement.js";

export interface FilesystemTransactionRuntime extends WorkspaceTransactionPaths {
  readonly nativeRootWitnesses: ReadonlyArray<NativeAuthorityRootWitness>;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly admission: Semaphore.Semaphore;
  readonly acquire: WorkspaceTransactionScopeService["acquire"];
  readonly held: Effect.Effect<Option.Option<HeldWorkspaceTransition>>;
}

// ---------------------------------------------------------------------------
// Closure API — consumed by the planning slice only
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
          SynchronizedRef.updateEffect(context.ledger, (ledger) =>
            cleanupRetirements(context.fs, context.path, closureSnapshots(ledger, closureId)).pipe(
              Effect.matchEffect({
                onSuccess: () => Effect.succeed(withoutClosure(ledger, closureId)),
                onFailure: (restorationCause) =>
                  Effect.map(
                    recoveryEntries(context.fs, context.path, closureSnapshots(ledger, closureId)),
                    (recovery) =>
                      withPendingRestoration(withoutClosure(ledger, closureId), {
                        closureId,
                        restorationCause,
                        retained: restorationCause.retained ?? [restorationCause.target],
                        recovery,
                      }),
                  ),
              }),
            ),
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
          SynchronizedRef.updateEffect(context.ledger, (ledger) =>
            Effect.gen(function* () {
              const { fs, path } = context;
              const owned = closureSnapshots(ledger, closureId);
              if (owned.length === 0) return withoutClosure(ledger, closureId);
              return yield* restoreAll(fs, path, owned, context.isTransitionCompromised).pipe(
                Effect.andThen(verifySnapshots(fs, path, owned)),
                Effect.andThen(cleanupRetirements(fs, path, owned)),
                Effect.matchEffect({
                  onFailure: (restorationCause) =>
                    Effect.map(recoveryEntries(fs, path, owned), (recovery) =>
                      withPendingRestoration(withoutClosure(ledger, closureId), {
                        closureId,
                        restorationCause,
                        recovery,
                        retained: (restorationCause instanceof WorkspaceRestorationError &&
                        restorationCause.retained !== undefined
                          ? restorationCause.retained
                          : owned.map((snapshot) => snapshot.target)
                        ).map((target) => workspaceRelative(path, context.workspaceDir, target)),
                      }),
                    ),
                  onSuccess: () => Effect.succeed(withoutClosure(ledger, closureId)),
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
export const runFilesystemTransaction = <A, E, R>(
  scope: FilesystemTransactionRuntime,
  args: WorkspaceTransactionArgs<A, E, R>,
): Effect.Effect<A, WorkspaceTransactionFailure | WorkspaceRestorationIncomplete | E, R> =>
  Effect.gen(function* () {
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

    const { fs, path } = scope;
    const workspaceDir = path.resolve(scope.workspaceDir);
    yield* assertNativeMutationWithin(
      scope.nativeRoot ?? path.dirname(workspaceDir),
      workspaceDir,
      "content",
      path.dirname(workspaceDir),
    ).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.mapError(
        (cause) => new WorkspaceDirectoryError({ path: workspaceDir, step: "inspect", cause }),
      ),
    );
    return yield* scope.admission.withPermits(1)(
      Effect.gen(function* () {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            // The invocation-level transition hold already provides
            // cross-process exclusion; acquiring here again would deadlock on
            // our own lock.
            if (Option.isNone(yield* scope.held)) {
              const contention = yield* scope.acquire({ command: "workspace-transaction" });
              if (Option.isSome(contention)) {
                return yield* new TransitionLockUnavailable({
                  holder: Option.getOrUndefined(contention.value.holder),
                  waitedMillis: contention.value.waitedMillis,
                });
              }
            }
            const held = Option.getOrUndefined(yield* scope.held);
            const ledger = yield* SynchronizedRef.make(emptyLedger);
            const context: WorkspaceTransactionContext = {
              isTransitionCompromised: held?.isCompromised ?? (() => false),
              fs,
              path,
              workspaceDir,
              nativeRoot: scope.nativeRoot ?? path.dirname(workspaceDir),
              nativeRoots: scope.nativeRoots ?? [scope.nativeRoot ?? path.dirname(workspaceDir)],
              nativeRootWitnesses: scope.nativeRootWitnesses,
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
                  recovery: [
                    ...(yield* recoveryEntries(fs, path, state.snapshots)),
                    ...state.pendingRestorations.flatMap((failure) => failure.recovery),
                  ],
                  retained: (restorationCause instanceof WorkspaceRestorationError &&
                  restorationCause.retained !== undefined
                    ? restorationCause.retained
                    : state.snapshots.map((snapshot) => snapshot.target)
                  ).map((target) => workspaceRelative(path, workspaceDir, target)),
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
                            Effect.andThen(cleanupRetirements(fs, path, state.snapshots)),
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
                  onSuccess: (value) =>
                    SynchronizedRef.get(ledger).pipe(
                      Effect.flatMap((state) =>
                        state.pendingRestorations.length > 0
                          ? Effect.void
                          : cleanupRetirements(fs, path, state.snapshots),
                      ),
                      Effect.matchEffect({
                        onFailure: (cause) => retainAll(Cause.fail(cause), cause),
                        onSuccess: () => removeSnapshotStore.pipe(Effect.as(value)),
                      }),
                    ),
                }),
              ),
            );
          }),
        );
      }),
    );
  });
