/**
 * Workspace transaction state: the ambient authority context and the write
 * registration primitives every workspace writer calls.
 *
 * This module owns the ambient transaction/closure references and the
 * protection primitives (`protectWorkspacePath`, `protectCreatedAncestors`)
 * that snapshot a path before its first mutation, plus the typed
 * restoration-incomplete fact and its boundary rendering. The transaction
 * runner and closure settlement mechanics that consume this context live in
 * `./operations/transaction.ts`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

import { AppError, makeAppError } from "../app-error/index.js";

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
>("@agentxm/extension-management/unstable/workspace/transaction/CurrentWorkspaceTransaction", {
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
  "@agentxm/extension-management/unstable/workspace/transaction/CurrentWorkspaceClosure",
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

/** Render the typed restoration failure for boundaries without a resolution. */
const firstCauseLine = (cause: Cause.Cause<unknown>): string => {
  const failure = Option.getOrUndefined(Cause.findErrorOption(cause));
  if (failure instanceof AppError) return failure.detail;
  return Cause.pretty(cause).split(/\r?\n/, 1)[0]?.trim() || "The transition did not complete";
};

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Render the deciding transition cause before restoration consequences. */
const transitionFailureText = (error: WorkspaceRestorationIncomplete): string =>
  error.terminationCause === "interruption"
    ? "Transition was interrupted."
    : `Transition failed: ${sentence(firstCauseLine(error.transitionCause))}`;

export const restorationIncompleteToAppError = (error: WorkspaceRestorationIncomplete): AppError =>
  makeAppError({
    code: "conflict",
    detail: `${transitionFailureText(error)} Workspace restoration did not complete; the affected paths keep the state the failure left${
      error.snapshotDir === undefined
        ? "."
        : `, and their pre-change snapshots are preserved at ${error.snapshotDir}.`
    }`,
    cause: {
      transition: Cause.pretty(error.transitionCause),
      restoration: error.restorationCause,
    },
    suggestions: [
      {
        description:
          "Re-run the command; the next mutation plans from the current workspace state.",
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
): Effect.Effect<void, AppError> =>
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
            Effect.mapError((error) =>
              transactionError(`Failed to inspect transaction target ${normalized}`, error),
            ),
          );
        if (!exists) {
          snapshot = { closure, target: normalized, state: "absent" };
        } else {
          if (context.snapshotStore.dir === undefined) {
            context.snapshotStore.dir = yield* fs
              .makeTempDirectory({ prefix: "axm-rollback-" })
              .pipe(
                Effect.mapError((error) =>
                  transactionError("Failed to create the rollback snapshot directory", error),
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
              Effect.mapError((error) =>
                transactionError(`Failed to snapshot transaction target ${normalized}`, error),
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
export const protectWorkspacePath = (target: string): Effect.Effect<void, AppError> =>
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
              const closure = yield* CurrentWorkspaceClosure;
              yield* protectInContext(context, firstMissing, closure);
            }
          }),
      }),
    ),
  );
