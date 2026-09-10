/**
 * The ambient transaction context and the write registration primitives
 * every workspace writer calls.
 *
 * `protectWorkspacePath` and `protectCreatedAncestors` snapshot a path before
 * its first mutation within the active closure. The context itself — the
 * ledger reference and the two ambient references that carry it — is
 * package-private: the transaction runner in `./transaction.ts` constructs
 * and provides it, and nothing outside this package can reach the ledger.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SynchronizedRef from "effect/SynchronizedRef";

import { WorkspaceSnapshotError } from "./errors.js";
import { isProtected, withSnapshot, type Snapshot, type TransactionLedger } from "./ledger.js";

export interface WorkspaceTransactionContext {
  readonly isTransitionCompromised: () => boolean;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceDir: string;
  /** The one serialized record of preimages, closures, and pending restorations. */
  readonly ledger: SynchronizedRef.SynchronizedRef<TransactionLedger>;
}

/** The active transaction, when one is running on this fiber's context. */
export const CurrentWorkspaceTransaction = ServiceMap.Reference<
  Option.Option<WorkspaceTransactionContext>
>("@agentxm/workspace-transactions/CurrentWorkspaceTransaction", {
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
  "@agentxm/workspace-transactions/CurrentWorkspaceClosure",
  { defaultValue: () => undefined },
);

/**
 * Take one target's preimage into the ledger, deduplicating on first touch
 * per closure. One serialized ledger transition: the snapshot store is
 * created, the backup name allocated, and the bytes copied while the ledger
 * is held, so no concurrent registration or rollback observes a half-taken
 * snapshot.
 */
export const protectInContext = (
  context: WorkspaceTransactionContext,
  target: string,
  closure: string | undefined,
): Effect.Effect<void, WorkspaceSnapshotError> =>
  SynchronizedRef.updateEffect(context.ledger, (ledger) =>
    Effect.gen(function* () {
      const { fs, path } = context;
      const normalized = path.resolve(target);
      // First-touch dedupe is per closure: a later closure touching a target
      // an earlier closure already committed needs its own — post-commit —
      // preimage, so restoring it undoes only that closure's work.
      if (isProtected(ledger, closure, normalized)) return ledger;
      const link = yield* fs.readLink(normalized).pipe(Effect.option);
      if (Option.isSome(link)) {
        const snapshot: Snapshot = {
          closure,
          target: normalized,
          state: "symlink",
          linkTarget: link.value,
        };
        return withSnapshot(ledger, snapshot, ledger);
      }
      const exists = yield* fs
        .exists(normalized)
        .pipe(
          Effect.mapError(
            (cause) =>
              new WorkspaceSnapshotError({ target: normalized, step: "inspect-target", cause }),
          ),
        );
      if (!exists) {
        return withSnapshot(ledger, { closure, target: normalized, state: "absent" }, ledger);
      }
      const snapshotDir =
        ledger.snapshotDir ??
        (yield* fs
          .makeTempDirectory({ prefix: "axm-rollback-" })
          .pipe(
            Effect.mapError(
              (cause) =>
                new WorkspaceSnapshotError({ target: normalized, step: "create-store", cause }),
            ),
          ));
      const backup = path.join(snapshotDir, `${ledger.snapshotSequence}.snap`);
      // The pre-change bytes are preserved before the path is first mutated;
      // a path that cannot be snapshotted is never mutated.
      yield* fs
        .copy(normalized, backup, { preserveTimestamps: true })
        .pipe(
          Effect.mapError(
            (cause) => new WorkspaceSnapshotError({ target: normalized, step: "copy", cause }),
          ),
        );
      return withSnapshot(
        ledger,
        { closure, target: normalized, state: "copied", backup },
        { snapshotDir, snapshotSequence: ledger.snapshotSequence + 1 },
      );
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
