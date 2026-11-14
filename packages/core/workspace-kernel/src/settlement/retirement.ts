import { NativeEntryRemoval } from "../locations/index.js";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { modifyTransactionLedger } from "./ledger-admission.js";

import {
  assertNativeMutationWithinRoots,
  resolveNativeReferent,
  type NativeEntryAddress,
} from "../locations/index.js";
import {
  CurrentWorkspaceClosure,
  CurrentWorkspaceTransaction,
  protectTransition,
  type ProtectObservation,
} from "./context.js";
import {
  WorkspaceRestorationError,
  WorkspaceSnapshotError,
  type WorkspaceRecoveryEntry,
} from "./errors.js";
import { recordFootprint } from "./footprint-recorder.js";
import type { Snapshot, TransactionLedger } from "./ledger.js";
import { equalPathStates, observePathState, observePathStateExcept } from "./path-state.js";

/** Whether an observed root value is an entry of the fresh address kind. */
const sameEntryKind = (root: string | undefined, kind: NativeEntryAddress["kind"]): boolean => {
  switch (kind) {
    case "symlink":
      return root?.startsWith("link:") === true;
    case "file":
      return root?.startsWith("file:") === true;
    case "directory":
      return root?.startsWith("directory:") === true;
    default:
      return false;
  }
};

/** The retirement's outcome and the ledger it commits: the protected one unless it retired. */
const settle = (
  exit: Exit.Exit<TransactionLedger, WorkspaceSnapshotError>,
  protectedLedger: TransactionLedger,
): readonly [Exit.Exit<void, WorkspaceSnapshotError>, TransactionLedger] =>
  Exit.isSuccess(exit) ? [Exit.void, exit.value] : [Exit.failCause(exit.cause), protectedLedger];

/**
 * Removal capability for an owner that has just verified its unit's ownership.
 * The existing transaction keeps the original entry, including filesystem
 * identity, until commit. No authority is inferred from reaching this function.
 */
export const retireWorkspacePath = Effect.fnUntraced(function* (
  target: string,
  options?: { readonly emptyOnly: boolean },
): Effect.fn.Return<
  void,
  WorkspaceSnapshotError,
  FileSystem.FileSystem | Path.Path | NativeEntryRemoval
> {
  const fs = yield* FileSystem.FileSystem;
  const removal = yield* NativeEntryRemoval;
  const path = yield* Path.Path;
  const current = yield* CurrentWorkspaceTransaction;
  const closure = yield* CurrentWorkspaceClosure;
  if (Option.isNone(current)) {
    const failure = (cause: unknown) => new WorkspaceSnapshotError({ target, step: "copy", cause });
    if (options?.emptyOnly === true)
      yield* removal.removeEmptyDirectory(target).pipe(Effect.mapError(failure));
    else yield* fs.remove(target, { recursive: true, force: false }).pipe(Effect.mapError(failure));
    yield* recordFootprint({ path: target, change: "removed" });
    return;
  }
  const context = current.value;
  const retire = (ledger: TransactionLedger, observed: Option.Option<ProtectObservation>) =>
    Effect.gen(function* () {
      const selected = yield* assertNativeMutationWithinRoots(
        context.nativeRoots,
        target,
        "entry",
        path.dirname(context.workspaceDir),
        context.nativeRootWitnesses,
      );
      const address = selected.address;
      const owner = ledger.snapshots.find(
        (snapshot) =>
          snapshot.closure === closure &&
          (address.entryPath === snapshot.target ||
            address.entryPath.startsWith(`${snapshot.target}${path.sep}`)),
      );
      if (owner === undefined)
        return yield* new WorkspaceSnapshotError({
          target,
          step: "inspect-target",
          cause: "unprotected-retirement",
        });
      // This admission's protection observed the owner tree. While the fresh
      // address still names it with the same kind, that observation stands
      // in for another; the check before the rename stays fresh.
      const reused = Option.filter(
        observed,
        (observation) =>
          observation.target === owner.target &&
          owner.target === address.entryPath &&
          sameEntryKind(observation.state.get(""), address.kind),
      );
      const actual = Option.isSome(reused)
        ? reused.value.state
        : yield* observePathState(fs, path, owner.target);
      if (!equalPathStates(actual, owner.expected))
        return yield* new WorkspaceSnapshotError({
          target,
          step: "inspect-target",
          cause: "foreign-change",
        });
      if (address.kind === "absent") return ledger;
      // A refusal decided on a reused observation is preceded by a fresh one,
      // so a foreign change since protection still takes precedence.
      const refuse =
        (store?: string) =>
        <A, E, R>(
          effect: Effect.Effect<A, E, R>,
        ): Effect.Effect<A, E | WorkspaceSnapshotError, R> =>
          Option.isNone(reused)
            ? effect
            : effect.pipe(
                Effect.catch((failure) =>
                  Effect.gen(function* () {
                    if (
                      equalPathStates(
                        yield* observePathState(fs, path, owner.target),
                        owner.expected,
                      )
                    )
                      return yield* Effect.fail(failure);
                    if (store !== undefined)
                      yield* removal.removeEmptyDirectory(store).pipe(Effect.ignore);
                    return yield* new WorkspaceSnapshotError({
                      target,
                      step: "inspect-target",
                      cause: "foreign-change",
                    });
                  }),
                ),
              );
      const { original, anchor } = yield* Effect.gen(function* () {
        const original = Option.isSome(reused)
          ? new Map(actual)
          : yield* observePathState(fs, path, address.entryPath);
        if (options?.emptyOnly === true && (address.kind !== "directory" || original.size !== 1))
          return yield* new WorkspaceSnapshotError({
            target,
            step: "inspect-target",
            cause: "directory-not-empty",
          });
        // Keep the quarantine outside the retired subtree on its own device.
        // Walking toward the authorized native root stops at a mount boundary.
        // This admission's route assertion resolved an ordinary selected root
        // live; other spellings resolve fresh.
        const nativeRoot = selected.root.ordinary
          ? selected.root.physicalRoot
          : yield* resolveNativeReferent(selected.nativeRoot);
        const workspaceRoot =
          selected.root.ordinary && context.nativeRoot === selected.nativeRoot
            ? nativeRoot
            : yield* resolveNativeReferent(context.nativeRoot);
        const separateRoot = nativeRoot !== workspaceRoot;
        if (address.entryPath === nativeRoot && (!separateRoot || options?.emptyOnly !== true))
          return yield* new WorkspaceSnapshotError({
            target,
            step: "inspect-target",
            cause: "cannot-retire-authority-root",
          });
        let anchor = separateRoot ? path.dirname(nativeRoot) : path.dirname(address.entryPath);
        const device = (yield* fs.stat(anchor)).dev;
        while (!separateRoot && anchor !== nativeRoot) {
          const parent = path.dirname(anchor);
          if (parent === anchor || (yield* fs.stat(parent)).dev !== device) break;
          anchor = parent;
        }
        if (anchor === owner.target || anchor.startsWith(`${owner.target}${path.sep}`)) {
          return yield* new WorkspaceSnapshotError({
            target,
            step: "inspect-target",
            cause: "retirement-needs-separate-boundary",
          });
        }
        return { original, anchor };
      }).pipe(refuse());
      const store = yield* fs
        .makeTempDirectory({ directory: anchor, prefix: ".axm-retired-" })
        .pipe(refuse());
      const backup = path.join(store, "entry");
      const storeIdentity = yield* Effect.gen(function* () {
        const storeIdentity = (yield* observePathState(fs, path, store)).get("");
        if (storeIdentity === undefined || !storeIdentity.startsWith("directory:"))
          return yield* new WorkspaceSnapshotError({
            target: store,
            step: "create-store",
            cause: "retirement-store-unreadable",
          });
        return storeIdentity;
      }).pipe(refuse(store));
      yield* Effect.gen(function* () {
        const fresh = yield* assertNativeMutationWithinRoots(
          context.nativeRoots,
          target,
          "entry",
          path.dirname(context.workspaceDir),
          context.nativeRootWitnesses,
        );
        if (
          fresh.address.entryPath !== address.entryPath ||
          !equalPathStates(yield* observePathState(fs, path, address.entryPath), original)
        )
          return yield* new WorkspaceSnapshotError({
            target,
            step: "inspect-target",
            cause: "foreign-change",
          });
        yield* fs.rename(address.entryPath, backup);
      }).pipe(Effect.onError(() => removal.removeEmptyDirectory(store).pipe(Effect.ignore)));
      return {
        ...ledger,
        snapshots: ledger.snapshots.map((snapshot) =>
          snapshot === owner
            ? {
                ...snapshot,
                retirements: [
                  ...(snapshot.retirements ?? []),
                  { target: address.entryPath, backup, original, storeIdentity },
                ],
              }
            : snapshot,
        ),
      };
    }).pipe(
      Effect.mapError((cause) =>
        cause instanceof WorkspaceSnapshotError
          ? cause
          : new WorkspaceSnapshotError({ target, step: "copy", cause }),
      ),
    );
  // Protection and retirement are one admission. A failed retirement still
  // commits the protection, whose snapshot and store remain the transaction's.
  const retired = yield* modifyTransactionLedger(context.ledger, (ledger) =>
    Effect.gen(function* () {
      const protection = yield* protectTransition(context, ledger, target, closure).pipe(
        Effect.withSpan("axm.publish.snapshot"),
      );
      return settle(
        yield* retire(protection.ledger, protection.observed).pipe(Effect.exit),
        protection.ledger,
      );
    }),
  );
  yield* retired;
  yield* recordFootprint({ path: target, change: "removed" });
}, Effect.uninterruptible);

/** Cleanup is part of settlement; a modified retained original is preserved. */
export const cleanupRetirements = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
): Effect.Effect<void, WorkspaceRestorationError> =>
  Effect.forEach(
    snapshots.flatMap((snapshot) => snapshot.retirements ?? []),
    (entry) =>
      Effect.gen(function* () {
        const store = path.dirname(entry.backup);
        // A matching store's entry is observed fresh, in full, just below.
        const storeState = yield* observePathStateExcept(
          fs,
          path,
          store,
          path.basename(entry.backup),
          entry.storeIdentity,
        );
        if (
          storeState.get("") !== entry.storeIdentity ||
          [...storeState.keys()].some(
            (name) => name !== "" && name !== "entry" && !name.startsWith(`entry${path.sep}`),
          )
        ) {
          return yield* new WorkspaceRestorationError({
            target: store,
            step: "foreign-change",
            cause: undefined,
            retained: [store],
          });
        }
        const state = yield* observePathState(fs, path, entry.backup);
        if (state.get("") !== "absent" && !equalPathStates(state, entry.original)) {
          return yield* new WorkspaceRestorationError({
            target: entry.backup,
            step: "foreign-change",
            cause: undefined,
            retained: [entry.backup],
          });
        }
        yield* fs.remove(store, { recursive: true, force: true }).pipe(
          Effect.mapError(
            (cause) =>
              new WorkspaceRestorationError({
                target: entry.backup,
                step: "stage",
                cause,
                retained: [entry.backup],
              }),
          ),
        );
      }),
    { discard: true },
  );

/** Report only preimages that remain present after attempted restoration. */
export const recoveryEntries = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
): Effect.fn.Return<ReadonlyArray<WorkspaceRecoveryEntry>> {
  const entries: Array<WorkspaceRecoveryEntry> = [];
  for (const snapshot of snapshots) {
    if (snapshot.state === "copied")
      entries.push({
        originalPath: snapshot.target,
        recoveryPath: snapshot.backup,
        kind: "snapshot",
      });
    for (const original of snapshot.retirements ?? []) {
      if ((yield* observePathState(fs, path, original.backup)).get("") !== "absent") {
        entries.push({
          originalPath: original.target,
          recoveryPath: original.backup,
          kind: "retired-entry",
        });
      }
    }
  }
  return entries;
});
