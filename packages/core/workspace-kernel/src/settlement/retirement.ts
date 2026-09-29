// @effect-diagnostics nodeBuiltinImport:off — atomic empty-only removal is absent from FileSystem.remove
import { rmdir } from "node:fs/promises";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SynchronizedRef from "effect/SynchronizedRef";

import { assertNativeMutationWithinRoots, resolveNativeReferent } from "../locations/index.js";
import {
  CurrentWorkspaceClosure,
  CurrentWorkspaceTransaction,
  protectInContext,
} from "./context.js";
import {
  WorkspaceRestorationError,
  WorkspaceSnapshotError,
  type WorkspaceRecoveryEntry,
} from "./errors.js";
import { recordFootprint } from "./footprint-recorder.js";
import type { Snapshot } from "./ledger.js";
import { equalPathStates, observePathState } from "./path-state.js";

/**
 * Removal capability for an owner that has just verified its unit's ownership.
 * The existing transaction keeps the original entry, including filesystem
 * identity, until commit. No authority is inferred from reaching this function.
 */
export const retireWorkspacePath = (
  target: string,
  options?: { readonly emptyOnly: boolean },
): Effect.Effect<void, WorkspaceSnapshotError, FileSystem.FileSystem | Path.Path> =>
  Effect.uninterruptible(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const current = yield* CurrentWorkspaceTransaction;
      const closure = yield* CurrentWorkspaceClosure;
      if (Option.isNone(current)) {
        const failure = (cause: unknown) =>
          new WorkspaceSnapshotError({ target, step: "copy", cause });
        if (options?.emptyOnly === true)
          yield* Effect.tryPromise(() => rmdir(target)).pipe(Effect.mapError(failure));
        else
          yield* fs
            .remove(target, { recursive: true, force: false })
            .pipe(Effect.mapError(failure));
        yield* recordFootprint({ path: target, change: "removed" });
        return;
      }
      const context = current.value;
      yield* protectInContext(context, target, closure);
      yield* SynchronizedRef.updateEffect(context.ledger, (ledger) =>
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
          const actual = yield* observePathState(fs, path, owner.target);
          if (!equalPathStates(actual, owner.expected))
            return yield* new WorkspaceSnapshotError({
              target,
              step: "inspect-target",
              cause: "foreign-change",
            });
          if (address.kind === "absent") return ledger;
          const original = yield* observePathState(fs, path, address.entryPath);
          if (options?.emptyOnly === true && (address.kind !== "directory" || original.size !== 1))
            return yield* new WorkspaceSnapshotError({
              target,
              step: "inspect-target",
              cause: "directory-not-empty",
            });
          // Keep the quarantine outside the retired subtree on its own device.
          // Walking toward the authorized native root stops at a mount boundary.
          const nativeRoot = yield* resolveNativeReferent(selected.nativeRoot);
          const workspaceRoot = yield* resolveNativeReferent(context.nativeRoot);
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
          const store = yield* fs.makeTempDirectory({ directory: anchor, prefix: ".axm-retired-" });
          const backup = path.join(store, "entry");
          const storeIdentity = (yield* observePathState(fs, path, store)).get("");
          if (storeIdentity === undefined || !storeIdentity.startsWith("directory:"))
            return yield* new WorkspaceSnapshotError({
              target: store,
              step: "create-store",
              cause: "retirement-store-unreadable",
            });
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
          }).pipe(Effect.onError(() => Effect.tryPromise(() => rmdir(store)).pipe(Effect.ignore)));
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
        ),
      );
      yield* recordFootprint({ path: target, change: "removed" });
    }),
  );

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
        const storeState = yield* observePathState(fs, path, store);
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
export const recoveryEntries = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
): Effect.Effect<ReadonlyArray<WorkspaceRecoveryEntry>> =>
  Effect.gen(function* () {
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
