import { createHash, randomBytes } from "node:crypto";

import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Semaphore from "effect/Semaphore";

import { AppError, makeAppError } from "../app-error/index.js";
import { recordFootprint } from "./footprint-recorder.js";
import {
  acquireWorkspaceTransitionLock,
  heldWorkspaceTransition,
  isWorkspaceTransitionHeldByThisInvocation,
  WorkspaceTransitionCompromised,
} from "./transition-lock.js";

type Snapshot = { readonly closure: string | undefined } & (
  | { readonly target: string; readonly state: "absent" }
  | { readonly target: string; readonly state: "copied"; readonly backup: string }
  | { readonly target: string; readonly state: "symlink"; readonly linkTarget: string }
);

/** A closure rollback that could not complete, recorded for the transaction end. */
interface PendingClosureRestorationFailure {
  readonly closureId: string;
  readonly restorationCause: unknown;
  readonly retained: ReadonlyArray<string>;
}

interface WorkspaceTransactionContext {
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

const CurrentWorkspaceTransaction = ServiceMap.Reference<
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
const CurrentWorkspaceClosure = ServiceMap.Reference<string | undefined>(
  "@agentxm/extension-management/unstable/workspace/transaction/CurrentWorkspaceClosure",
  { defaultValue: () => undefined },
);

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

const closureKey = (closure: string | undefined): string => closure ?? "";

const protectInContext = (
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

const dropClosureSnapshots = (context: WorkspaceTransactionContext, closureId: string): void => {
  let index = context.snapshots.length;
  while (index > 0) {
    index -= 1;
    if (context.snapshots[index]?.closure === closureId) {
      context.snapshots.splice(index, 1);
    }
  }
  context.protectedTargets.delete(closureKey(closureId));
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
): Effect.Effect<void, PlatformError | AppError> =>
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
          return yield* transactionError(
            `Staged restoration did not validate for ${snapshot.target}`,
            { staged, expected: snapshot.linkTarget },
          );
        }
      } else {
        yield* fs.copy(snapshot.backup, staging, { preserveTimestamps: true });
        const stagedHash = yield* hashPathState(fs, path, staging);
        const backupHash = yield* hashPathState(fs, path, snapshot.backup);
        if (stagedHash !== backupHash || stagedHash === "unhashable") {
          return yield* transactionError(
            `Staged restoration did not validate for ${snapshot.target}`,
            { stagedHash, backupHash },
          );
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
): Effect.Effect<void, PlatformError | AppError> =>
  Effect.forEach(
    [...snapshots].reverse(),
    (snapshot) =>
      Effect.suspend((): Effect.Effect<void, PlatformError | AppError> =>
        // Restoration is a durable write like any other: once lock ownership
        // is lost it must stop, or it could overwrite a successor's work.
        transitionCompromised()
          ? Effect.fail(
              transactionError(
                `Workspace restoration stopped before ${snapshot.target}: the workspace transition was compromised`,
                undefined,
              ),
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
  AppError | WorkspaceRestorationIncomplete | E,
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
          Effect.mapError((error) =>
            transactionError(`Failed to inspect workspace state directory ${ancestor}`, error),
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
            Effect.mapError((error) =>
              transactionError(`Failed to create workspace state directory ${workspaceDir}`, error),
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
                const holder = Option.getOrUndefined(contention.value.holder);
                return yield* makeAppError({
                  code: "conflict",
                  detail: `another operation holds the workspace transition${
                    holder === undefined ? "" : ` (${holder.command} (pid ${holder.pid}))`
                  }; waited ${Math.round(contention.value.waitedMillis / 1000)}s`,
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
            ).pipe(
              // The compromise branch above consumes the raced error; this
              // conversion only discharges the type union — an escaped
              // compromise still surfaces as its conflict rendering.
              Effect.catchIf(
                (error): error is WorkspaceTransitionCompromised =>
                  error instanceof WorkspaceTransitionCompromised,
                (error) =>
                  Effect.fail(
                    makeAppError({
                      code: "conflict",
                      detail: `The workspace transition at ${error.lockPath} was compromised; the operation stopped.`,
                      cause: error.cause,
                    }),
                  ),
              ),
            );
          }),
        ).pipe(Effect.ensuring(removeEmptyScratch), Effect.ensuring(removeNewEmptyWorkspace));
      }),
    );
  });
