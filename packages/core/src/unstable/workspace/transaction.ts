import { createHash } from "node:crypto";

import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Semaphore from "effect/Semaphore";

import { makeAppError, type AppError } from "../app-error/index.js";
import { recordFootprint } from "./footprint-recorder.js";
import {
  acquireWorkspaceTransitionLock,
  heldWorkspaceTransition,
  isWorkspaceTransitionHeldByThisInvocation,
  WorkspaceTransitionCompromised,
} from "./transition-lock.js";

type Snapshot =
  | { readonly target: string; readonly state: "absent" }
  | { readonly target: string; readonly state: "copied"; readonly backup: string }
  | { readonly target: string; readonly state: "symlink"; readonly linkTarget: string };

interface WorkspaceTransactionContext {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceDir: string;
  /** Uniquely prefixed OS-temporary directory holding rollback snapshots. */
  readonly snapshotStore: { dir: string | undefined };
  readonly protectedTargets: Set<string>;
  readonly snapshots: Array<Snapshot>;
  readonly snapshotSemaphore: Semaphore.Semaphore;
}

const CurrentWorkspaceTransaction = ServiceMap.Reference<
  Option.Option<WorkspaceTransactionContext>
>("@agentxm/client-core/unstable/workspace/CurrentWorkspaceTransaction", {
  defaultValue: () => Option.none(),
});

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
}> {}

/** Render the typed restoration failure for boundaries without a resolution. */
export const restorationIncompleteToAppError = (error: WorkspaceRestorationIncomplete): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Workspace restoration did not complete; the affected paths keep the state the failure left${
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

const protectInContext = (
  context: WorkspaceTransactionContext,
  target: string,
): Effect.Effect<void, AppError> =>
  context.snapshotSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const { fs, path } = context;
      const normalized = path.resolve(target);
      if (context.protectedTargets.has(normalized)) return;
      const link = yield* fs.readLink(normalized).pipe(Effect.option);
      let snapshot: Snapshot;
      if (Option.isSome(link)) {
        snapshot = { target: normalized, state: "symlink", linkTarget: link.value };
      } else {
        const exists = yield* fs
          .exists(normalized)
          .pipe(
            Effect.mapError((error) =>
              transactionError(`Failed to inspect transaction target ${normalized}`, error),
            ),
          );
        if (!exists) {
          snapshot = { target: normalized, state: "absent" };
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
          const backup = path.join(context.snapshotStore.dir, `${context.snapshots.length}.snap`);
          // The pre-change bytes are preserved before the path is first
          // mutated; a path that cannot be snapshotted is never mutated.
          yield* fs
            .copy(normalized, backup, { preserveTimestamps: true })
            .pipe(
              Effect.mapError((error) =>
                transactionError(`Failed to snapshot transaction target ${normalized}`, error),
              ),
            );
          snapshot = { target: normalized, state: "copied", backup };
        }
      }
      context.protectedTargets.add(normalized);
      context.snapshots.push(snapshot);
    }),
  );

/** Snapshot a path before its first mutation when a workspace transaction is active. */
export const protectWorkspacePath = (target: string): Effect.Effect<void, AppError> =>
  CurrentWorkspaceTransaction.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (context) => protectInContext(context, target),
      }),
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
              yield* protectInContext(context, firstMissing);
            }
          }),
      }),
    ),
  );

const restoreSnapshot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshot: Snapshot,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    yield* fs.remove(snapshot.target, { recursive: true, force: true });
    if (snapshot.state === "absent") return;
    yield* fs.makeDirectory(path.dirname(snapshot.target), { recursive: true });
    if (snapshot.state === "symlink") {
      yield* fs.symlink(snapshot.linkTarget, snapshot.target);
      return;
    }
    yield* fs.copy(snapshot.backup, snapshot.target, { preserveTimestamps: true });
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
      yield* Effect.forEach(
        normalizedTargets(current.value.path, args.targets),
        (target) => protectInContext(current.value, target),
        { discard: true },
      );
      const value = yield* args.transition;
      yield* args.validate(value);
      return value;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspaceDir = path.resolve(args.workspaceDir);
    const workspaceExisted = yield* fs
      .exists(workspaceDir)
      .pipe(
        Effect.mapError((error) =>
          transactionError(`Failed to inspect workspace state directory ${workspaceDir}`, error),
        ),
      );

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
        const removeNewEmptyWorkspace = workspaceExisted
          ? Effect.void
          : fs.readDirectory(workspaceDir).pipe(
              Effect.flatMap((entries) =>
                entries.length === 0
                  ? fs.remove(workspaceDir, { recursive: true, force: false })
                  : Effect.void,
              ),
              Effect.ignore,
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
              protectedTargets: new Set(),
              snapshots: [],
              snapshotSemaphore: Semaphore.makeUnsafe(1),
            };
            const removeSnapshotStore = Effect.suspend(() =>
              context.snapshotStore.dir === undefined
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
              yield* Effect.forEach(
                normalizedTargets(path, args.targets),
                (target) => protectInContext(context, target),
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

            return yield* Effect.raceFirst(business, compromiseSignal).pipe(
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
              Effect.uninterruptible,
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
