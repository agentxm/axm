/**
 * Workspace transaction state: the ambient authority context, the write
 * registration primitives every workspace writer calls, and the typed
 * failure vocabulary of the transaction and transition-lock machinery.
 *
 * This module owns the ambient transaction/closure references and the
 * protection primitives (`protectWorkspacePath`, `protectCreatedAncestors`)
 * that snapshot a path before its first mutation. The transaction runner and
 * closure settlement mechanics that consume this context live in
 * `./operations/transaction.ts`; the application error boundary owns the
 * rendering, codes, and suggestions for every failure declared here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

/** One pre-mutation preimage of a protected path, keyed to its owning closure. */
export type Snapshot = { readonly closure: string | undefined } & (
  | { readonly target: string; readonly state: "absent" }
  | { readonly target: string; readonly state: "copied"; readonly backup: string }
  | { readonly target: string; readonly state: "symlink"; readonly linkTarget: string }
);

/** A closure rollback that could not complete, recorded for the transaction end. */
export interface PendingClosureRestorationFailure {
  readonly closureId: string;
  readonly restorationCause: unknown;
  readonly retained: ReadonlyArray<string>;
}

export interface WorkspaceTransactionContext {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceDir: string;
  /** Uniquely prefixed OS-temporary directory holding rollback snapshots. */
  readonly snapshotStore: { dir: string | undefined };
  /** Per-closure first-touch dedupe; the key "" is the operation closure. */
  readonly protectedTargets: Map<string, Set<string>>;
  readonly snapshots: Array<Snapshot>;
  readonly snapshotSemaphore: Semaphore.Semaphore;
  /** Closure rollbacks that failed; the transaction fails typed at its end. */
  readonly pendingRestorationFailures: Array<PendingClosureRestorationFailure>;
  /** Monotonic backup-name counter: settlement drops entries, names never recur. */
  readonly snapshotSequence: { value: number };
}

export const CurrentWorkspaceTransaction = ServiceMap.Reference<
  Option.Option<WorkspaceTransactionContext>
>("@agentxm/workspace-state/workspace/transaction/CurrentWorkspaceTransaction", {
  defaultValue: () => Option.none(),
});

/**
 * The semantic closure whose mutations are currently executing. Snapshots
 * taken while a closure is active belong to it: they are dropped when the
 * closure settles and restored when it — and only it — rolls back. Snapshots
 * taken outside any closure belong to the operation closure and are restored
 * by the transaction's own failure handling.
 */
export const CurrentWorkspaceClosure = ServiceMap.Reference<string | undefined>(
  "@agentxm/workspace-state/workspace/transaction/CurrentWorkspaceClosure",
  { defaultValue: () => undefined },
);

/**
 * Restoration did not complete: the typed fact the terminal resolution
 * derives outcome, disposition, and exit status from. The pre-change
 * snapshots survive in the OS-temporary snapshot directory; nothing about
 * this failure persists in the workspace, and the next mutation converges
 * from the current workspace state.
 */
export class WorkspaceRestorationIncomplete extends Data.TaggedError(
  "WorkspaceRestorationIncomplete",
)<{
  readonly terminationCause: "failure" | "interruption";
  readonly transitionCause: Cause.Cause<unknown>;
  readonly restorationCause: unknown;
  /** OS-temporary directory preserving the pre-change snapshots, when any were taken. */
  readonly snapshotDir: string | undefined;
  /** Protected paths, workspace-root-relative where possible, left as the failure left them. */
  readonly retained: ReadonlyArray<string>;
  /** Closures whose rollback did not complete, when closure-scoped. */
  readonly closureIds?: ReadonlyArray<string>;
}> {}

/** Identity an invocation records while it holds the workspace transition. */
export interface TransitionLockHolder {
  readonly command: string;
  readonly pid: number;
  readonly candidateId?: string;
}

export interface TransitionContention {
  /** The holder recorded by the invocation that owns the lock, when readable. */
  readonly holder: Option.Option<TransitionLockHolder>;
  readonly waitedMillis: number;
}

/**
 * Registering a path with the active transaction failed: the pre-mutation
 * preimage could not be taken, so the path was never mutated. `target` is the
 * path being protected; the `create-store` step's message interpolates
 * nothing.
 */
export class WorkspaceSnapshotError extends Data.TaggedError("WorkspaceSnapshotError")<{
  readonly target: string;
  readonly step: "inspect-target" | "create-store" | "copy" | "inspect-ancestor";
  readonly cause: unknown;
}> {}

/** Preparing the workspace state directory for a transition failed. */
export class WorkspaceDirectoryError extends Data.TaggedError("WorkspaceDirectoryError")<{
  readonly path: string;
  readonly step: "inspect" | "create";
  readonly cause: unknown;
}> {}

/**
 * Workspace transition-lock mechanics failed. `path` carries the fact each
 * step's message interpolates: the scratch directory for `create-scratch`,
 * the lock path otherwise. `missing-timestamp` has no underlying cause.
 */
export class TransitionLockError extends Data.TaggedError("TransitionLockError")<{
  readonly path: string;
  readonly step:
    | "create-scratch"
    | "acquire"
    | "record-holder"
    | "inspect-timestamp"
    | "missing-timestamp"
    | "preserve-timestamp"
    | "release";
  readonly cause?: unknown;
}> {}

/**
 * The bounded contention wait elapsed while another invocation held the
 * workspace transition.
 */
export class TransitionLockUnavailable extends Data.TaggedError("TransitionLockUnavailable")<{
  readonly holder: TransitionLockHolder | undefined;
  readonly waitedMillis: number;
}> {}

/**
 * The hold is no longer provably owned: ownership could not be confirmed
 * within the staleness window, so a contender may already have reclaimed the
 * lock. Any further durable write by the original owner — mutation and
 * restoration alike — could overwrite a successor's work.
 */
export class WorkspaceTransitionCompromised extends Data.TaggedError(
  "WorkspaceTransitionCompromised",
)<{
  readonly workspaceDir: string;
  readonly lockPath: string;
  readonly cause: unknown;
}> {}

/**
 * One restoration step did not complete or verify. Never a channel failure:
 * it travels as the `restorationCause` inside
 * {@link WorkspaceRestorationIncomplete} and the pending closure records.
 */
export class WorkspaceRestorationError extends Data.TaggedError("WorkspaceRestorationError")<{
  readonly target: string;
  readonly step: "stage" | "stopped" | "verify";
  readonly cause: unknown;
}> {}

/** Failures acquiring the workspace transition lock. */
export type WorkspaceTransitionAcquireFailure = WorkspaceDirectoryError | TransitionLockError;

/** Failures the transaction machinery itself produces, beside the transition's own. */
export type WorkspaceTransactionFailure =
  | WorkspaceSnapshotError
  | WorkspaceDirectoryError
  | TransitionLockError
  | TransitionLockUnavailable
  | WorkspaceTransitionCompromised;

const closureKey = (closure: string | undefined): string => closure ?? "";

/**
 * Snapshot one target into the active transaction context, deduplicating on
 * first touch per closure. Shared by the registration primitives below and by
 * the transaction runner claiming its declared targets.
 */
export const protectInContext = (
  context: WorkspaceTransactionContext,
  target: string,
  closure: string | undefined,
): Effect.Effect<void, WorkspaceSnapshotError> =>
  context.snapshotSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const { fs, path } = context;
      const normalized = path.resolve(target);
      // First-touch dedupe is per closure: a later closure touching a target
      // an earlier closure already committed needs its own — post-commit —
      // preimage, so restoring it undoes only that closure's work.
      const key = closureKey(closure);
      const protectedForClosure = context.protectedTargets.get(key) ?? new Set<string>();
      if (protectedForClosure.has(normalized)) return;
      const link = yield* fs.readLink(normalized).pipe(Effect.option);
      let snapshot: Snapshot;
      if (Option.isSome(link)) {
        snapshot = { closure, target: normalized, state: "symlink", linkTarget: link.value };
      } else {
        const exists = yield* fs
          .exists(normalized)
          .pipe(
            Effect.mapError(
              (cause) =>
                new WorkspaceSnapshotError({ target: normalized, step: "inspect-target", cause }),
            ),
          );
        if (!exists) {
          snapshot = { closure, target: normalized, state: "absent" };
        } else {
          if (context.snapshotStore.dir === undefined) {
            context.snapshotStore.dir = yield* fs
              .makeTempDirectory({ prefix: "axm-rollback-" })
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new WorkspaceSnapshotError({ target: normalized, step: "create-store", cause }),
                ),
              );
          }
          const backup = path.join(
            context.snapshotStore.dir,
            `${context.snapshotSequence.value++}.snap`,
          );
          // The pre-change bytes are preserved before the path is first
          // mutated; a path that cannot be snapshotted is never mutated.
          yield* fs
            .copy(normalized, backup, { preserveTimestamps: true })
            .pipe(
              Effect.mapError(
                (cause) => new WorkspaceSnapshotError({ target: normalized, step: "copy", cause }),
              ),
            );
          snapshot = { closure, target: normalized, state: "copied", backup };
        }
      }
      protectedForClosure.add(normalized);
      context.protectedTargets.set(key, protectedForClosure);
      context.snapshots.push(snapshot);
    }),
  );

/** Snapshot a path before its first mutation when a workspace transaction is active. */
export const protectWorkspacePath = (target: string): Effect.Effect<void, WorkspaceSnapshotError> =>
  Effect.gen(function* () {
    const current = yield* CurrentWorkspaceTransaction;
    if (Option.isNone(current)) return;
    const closure = yield* CurrentWorkspaceClosure;
    yield* protectInContext(current.value, target, closure);
  });

/**
 * Closure rollbacks that could not complete and verify, with the snapshot
 * store that still preserves their pre-change bytes. Read at the end of a
 * plan apply so the terminal resolution derives retained state from the
 * in-memory facts alone. `None` outside a transaction.
 */
export const readPendingClosureRestorationFailures: Effect.Effect<
  Option.Option<{
    readonly failures: ReadonlyArray<{
      readonly closureId: string;
      readonly restorationCause: unknown;
      readonly retained: ReadonlyArray<string>;
    }>;
    readonly snapshotDir: string | undefined;
  }>
> = CurrentWorkspaceTransaction.pipe(
  Effect.map(
    Option.map((context) => ({
      failures: [...context.pendingRestorationFailures],
      snapshotDir: context.snapshotStore.dir,
    })),
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
): Effect.Effect<void, WorkspaceSnapshotError> =>
  CurrentWorkspaceTransaction.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (context) =>
          Effect.gen(function* () {
            let firstMissing: string | undefined;
            let current = path.resolve(directory);
            while (true) {
              const exists = yield* fs.exists(current).pipe(
                Effect.mapError(
                  (cause) =>
                    new WorkspaceSnapshotError({
                      target: current,
                      step: "inspect-ancestor",
                      cause,
                    }),
                ),
              );
              if (exists) break;
              firstMissing = current;
              const parent = path.dirname(current);
              if (parent === current) break;
              current = parent;
            }
            if (firstMissing !== undefined) {
              const closure = yield* CurrentWorkspaceClosure;
              yield* protectInContext(context, firstMissing, closure);
            }
          }),
      }),
    ),
  );
