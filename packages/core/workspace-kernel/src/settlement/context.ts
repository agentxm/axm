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

import {
  assertNativeMutationWithinRoots,
  resolveNativeEntry,
  resolveNativeReferent,
  type NativeAuthorityRootWitness,
} from "../locations/index.js";
import { WorkspaceSnapshotError } from "./errors.js";
import { isProtected, withSnapshot, type Snapshot, type TransactionLedger } from "./ledger.js";
import {
  equalPathStates,
  observeAncestorRoute,
  observePathState,
  replacePathState,
} from "./path-state.js";

export interface WorkspaceTransactionContext {
  readonly isTransitionCompromised: () => boolean;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceDir: string;
  readonly nativeRoot: string;
  readonly nativeRoots: ReadonlyArray<string>;
  readonly nativeRootWitnesses: ReadonlyArray<NativeAuthorityRootWitness>;
  /** The one serialized record of preimages, closures, and pending restorations. */
  readonly ledger: SynchronizedRef.SynchronizedRef<TransactionLedger>;
}

/** The active transaction, when one is running on this fiber's context. */
export const CurrentWorkspaceTransaction = ServiceMap.Reference<
  Option.Option<WorkspaceTransactionContext>
>("@agentxm/workspace-kernel/settlement/CurrentWorkspaceTransaction", {
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
  "@agentxm/workspace-kernel/settlement/CurrentWorkspaceClosure",
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
      const workspaceRoot = path.dirname(context.workspaceDir);
      const { address, nativeRoot } = yield* assertNativeMutationWithinRoots(
        context.nativeRoots,
        target,
        "entry",
        workspaceRoot,
        context.nativeRootWitnesses,
      ).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.mapError(
          (cause) => new WorkspaceSnapshotError({ target, step: "inspect-target", cause }),
        ),
      );
      const normalized = address.entryPath;
      const captured = ledger.resolvedEntries.get(address.lexicalPath);
      if (captured !== undefined && captured !== normalized) {
        return yield* new WorkspaceSnapshotError({
          target,
          step: "inspect-target",
          cause: "native-alias-changed",
        });
      }
      if (address.kind === "file" && (address.links ?? 1) > 1) {
        return yield* new WorkspaceSnapshotError({
          target,
          step: "inspect-target",
          cause: "hardlinked-native-file",
        });
      }
      const observedLedger = {
        ...ledger,
        resolvedEntries: new Map(ledger.resolvedEntries).set(address.lexicalPath, normalized),
      };
      // First-touch dedupe is per closure: a later closure touching a target
      // an earlier closure already committed needs its own — post-commit —
      // preimage, so restoring it undoes only that closure's work.
      const exact = ledger.snapshots.find(
        (snapshot) => snapshot.closure === closure && snapshot.target === normalized,
      );
      if (
        exact !== undefined &&
        !equalPathStates(yield* observePathState(fs, path, normalized), exact.expected)
      ) {
        return yield* new WorkspaceSnapshotError({
          target,
          step: "inspect-target",
          cause: "foreign-change",
        });
      }
      if (
        isProtected(ledger, closure, normalized) ||
        ledger.snapshots.some(
          (snapshot) =>
            snapshot.closure === closure && normalized.startsWith(`${snapshot.target}${path.sep}`),
        )
      )
        return observedLedger;
      const expected = yield* observePathState(fs, path, normalized);
      if ([...expected.values()].includes("unreadable")) {
        return yield* new WorkspaceSnapshotError({
          target,
          step: "inspect-target",
          cause: "unreadable-preimage",
        });
      }
      const route = yield* Effect.gen(function* () {
        const parents = new Map([
          ...(yield* observeAncestorRoute(fs, path, normalized)),
          ...(yield* observeAncestorRoute(fs, path, nativeRoot)),
        ]);
        const physicalRoot = yield* resolveNativeReferent(nativeRoot);
        const rootLink = Option.getOrUndefined(yield* fs.readLink(nativeRoot).pipe(Effect.option));
        return { parents, nativeRoot, physicalRoot, rootLink };
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.mapError(
          (cause) => new WorkspaceSnapshotError({ target, step: "inspect-target", cause }),
        ),
      );
      if ([...route.parents.values()].includes("unreadable"))
        return yield* new WorkspaceSnapshotError({
          target,
          step: "inspect-target",
          cause: "unreadable-parent-route",
        });
      const link = yield* fs.readLink(normalized).pipe(Effect.option);
      if (Option.isSome(link)) {
        const snapshot: Snapshot = {
          closure,
          route,
          expected,
          preimage: expected,
          target: normalized,
          state: "symlink",
          linkTarget: link.value,
        };
        return withSnapshot(observedLedger, snapshot, observedLedger);
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
        // Initial admission can protect a missing leaf before publication
        // protects its missing parent. They restore as one absent boundary.
        const descendants = ledger.snapshots.filter(
          (snapshot) =>
            snapshot.closure === closure && snapshot.target.startsWith(`${normalized}${path.sep}`),
        );
        for (const previous of descendants) {
          const actual = yield* observePathState(fs, path, previous.target);
          if (previous.state !== "absent" || !equalPathStates(actual, previous.expected)) {
            return yield* new WorkspaceSnapshotError({
              target: previous.target,
              step: "inspect-target",
              cause: "foreign-change",
            });
          }
        }
        return withSnapshot(
          {
            ...observedLedger,
            snapshots: ledger.snapshots.filter((snapshot) => !descendants.includes(snapshot)),
          },
          {
            closure,
            route,
            expected,
            preimage: expected,
            target: normalized,
            state: "absent",
            retirements: descendants.flatMap((snapshot) => snapshot.retirements ?? []),
          },
          observedLedger,
        );
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
      // If a broader directory is protected after one of its children, its
      // live tree already includes that earlier AXM write. Rewind those child
      // preimages in the backup before coalescing them into one boundary.
      const descendants = ledger.snapshots.filter(
        (snapshot) =>
          snapshot.closure === closure && snapshot.target.startsWith(`${normalized}${path.sep}`),
      );
      let preimage = expected;
      for (const previous of descendants) {
        const actual = yield* observePathState(fs, path, previous.target);
        if (!equalPathStates(actual, previous.expected)) {
          return yield* new WorkspaceSnapshotError({
            target: previous.target,
            step: "inspect-target",
            cause: "foreign-change",
          });
        }
        const nestedBackup = path.join(backup, path.relative(normalized, previous.target));
        preimage = replacePathState(
          path,
          preimage,
          path.relative(normalized, previous.target),
          previous.preimage,
        );
        yield* Effect.gen(function* () {
          yield* fs.remove(nestedBackup, { recursive: true, force: true });
          if (previous.state === "absent") return;
          yield* fs.makeDirectory(path.dirname(nestedBackup), { recursive: true });
          if (previous.state === "symlink") yield* fs.symlink(previous.linkTarget, nestedBackup);
          else yield* fs.copy(previous.backup, nestedBackup, { preserveTimestamps: true });
        }).pipe(
          Effect.mapError(
            (cause) => new WorkspaceSnapshotError({ target: normalized, step: "copy", cause }),
          ),
        );
      }
      return withSnapshot(
        {
          ...observedLedger,
          snapshots: ledger.snapshots.filter((snapshot) => !descendants.includes(snapshot)),
        },
        {
          closure,
          route,
          expected,
          preimage,
          target: normalized,
          state: "copied",
          backup,
          retirements: descendants.flatMap((snapshot) => snapshot.retirements ?? []),
        },
        { snapshotDir, snapshotSequence: ledger.snapshotSequence + 1 },
      );
    }),
  );

/** Capture a completed AXM mutation, independently of whether output recording is enabled. */
export const recordWorkspacePostimage = (target: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    const current = yield* CurrentWorkspaceTransaction;
    if (Option.isNone(current)) return;
    const context = current.value;
    const closure = yield* CurrentWorkspaceClosure;
    const { fs, path } = context;
    const address = yield* resolveNativeEntry(target).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.option,
    );
    // Unresolvable state can never become authority to overwrite it during rollback.
    if (Option.isNone(address)) return;
    yield* SynchronizedRef.updateEffect(context.ledger, (ledger) =>
      Effect.gen(function* () {
        const actual = yield* observePathState(fs, path, address.value.entryPath);
        const snapshots: Array<Snapshot> = [];
        for (const snapshot of ledger.snapshots) {
          const relative = path.relative(snapshot.target, address.value.entryPath);
          if (
            snapshot.closure === closure &&
            (relative === "" ||
              (!path.isAbsolute(relative) &&
                relative !== ".." &&
                !relative.startsWith(`..${path.sep}`)))
          ) {
            const expected = new Map(replacePathState(path, snapshot.expected, relative, actual));
            // Recursive creation adds ancestor entries too. Observe only each
            // directory entry, never absorb unrecorded siblings into AXM's delta.
            if (relative !== "" && actual.get("") !== "absent") {
              let parent = path.dirname(address.value.entryPath);
              while (
                parent === snapshot.target ||
                parent.startsWith(`${snapshot.target}${path.sep}`)
              ) {
                const key = path.relative(snapshot.target, parent);
                if (expected.get(key) === undefined || expected.get(key) === "absent") {
                  const parentState = yield* observePathState(fs, path, parent);
                  const entry = parentState.get("");
                  if (entry !== undefined) expected.set(key, entry);
                }
                if (parent === snapshot.target) break;
                parent = path.dirname(parent);
              }
            }
            snapshots.push({ ...snapshot, expected });
          } else snapshots.push(snapshot);
        }
        return { ...ledger, snapshots };
      }),
    );
  });

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
