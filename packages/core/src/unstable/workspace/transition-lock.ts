/**
 * Workspace transition lock.
 *
 * One cross-process lock serializes mutation-class operations on a workspace.
 * A mutating invocation acquires it before building the workspace read model
 * it will mutate from, holds it through apply, and releases it with its
 * resolution; the workspace transaction reuses the invocation's hold instead
 * of acquiring a second lock. A contending invocation waits with a visible
 * reason up to a bound, then terminates blocked with a machine-readable
 * reference to the holder.
 *
 * The lock file lives at `.axm/tmp/workspace-transition.lock`; its path is
 * load-bearing for operational tooling and must not move casually.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as lockfile from "proper-lockfile";

import { makeAppError, type AppError } from "../app-error/index.js";

export const TRANSITION_LOCK_FILENAME = "workspace-transition.lock";
// Staleness must tolerate a busy event loop: a missed mtime update under load
// must not let a live holder's lock be stolen mid-mutation.
const LOCK_STALE_MILLIS = 10_000;
const LOCK_UPDATE_MILLIS = 5_000;
const WAIT_INTERVAL = Duration.millis(250);
/** How long a contending invocation serializes behind the holder. */
export const TRANSITION_WAIT_BOUND_MILLIS = 60_000;

export interface TransitionLockHolder {
  readonly command: string;
  readonly pid: number;
  readonly candidateId?: string;
}

/**
 * Held transition locks in this process, keyed by resolved workspace
 * directory. Owned exclusively by `acquireWorkspaceTransitionLock`, whose
 * scope finalizer removes the entry, so an entry's lifetime is exactly the
 * lock's; the workspace transaction consults it to avoid deadlocking on the
 * invocation's own hold.
 */
const heldTransitions = new Set<string>();

export const isWorkspaceTransitionHeldByThisInvocation = (workspaceDir: string): boolean =>
  heldTransitions.has(workspaceDir);

const errorCode = (cause: unknown): string | undefined =>
  typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;

export const transitionLockPath = (path: Path.Path, workspaceDir: string): string =>
  path.join(workspaceDir, "tmp", TRANSITION_LOCK_FILENAME);

const readHolder = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  lockPath: string,
): Effect.Effect<Option.Option<TransitionLockHolder>> =>
  fs.readFileString(path.join(lockPath, "holder.json")).pipe(
    Effect.map((content) => {
      const parsed: unknown = JSON.parse(content);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "command" in parsed &&
        typeof parsed.command === "string" &&
        "pid" in parsed &&
        typeof parsed.pid === "number"
      ) {
        return Option.some({
          command: parsed.command,
          pid: parsed.pid,
          ...("candidateId" in parsed && typeof parsed.candidateId === "string"
            ? { candidateId: parsed.candidateId }
            : {}),
        } satisfies TransitionLockHolder);
      }
      return Option.none<TransitionLockHolder>();
    }),
    Effect.catch(() => Effect.succeed(Option.none<TransitionLockHolder>())),
  );

const writeHolder = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  lockPath: string,
  holder: TransitionLockHolder,
): Effect.Effect<void> =>
  fs
    .writeFileString(path.join(lockPath, "holder.json"), JSON.stringify(holder))
    .pipe(Effect.ignore);

export interface TransitionContention {
  /** The holder recorded by the invocation that owns the lock, when readable. */
  readonly holder: Option.Option<TransitionLockHolder>;
  readonly waitedMillis: number;
}

/**
 * Acquire the workspace transition lock, waiting up to the bound while
 * another invocation holds it. Resolves `None` when acquired (the release is
 * a scope finalizer) and `Some(contention)` when the bound elapsed.
 */
export const acquireWorkspaceTransitionLock = (args: {
  readonly workspaceDir: string;
  readonly holder: TransitionLockHolder;
  readonly waitBoundMillis?: number;
  /** Called once when the invocation starts waiting on another holder. */
  readonly onWaiting?: (holder: Option.Option<TransitionLockHolder>) => Effect.Effect<void>;
}): Effect.Effect<
  Option.Option<TransitionContention>,
  AppError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspaceDir = path.resolve(args.workspaceDir);
    const scratchDir = path.join(workspaceDir, "tmp");
    const lockPath = path.join(scratchDir, TRANSITION_LOCK_FILENAME);
    const waitBound = args.waitBoundMillis ?? TRANSITION_WAIT_BOUND_MILLIS;
    const workspaceExisted = yield* fs.exists(workspaceDir).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect workspace state directory ${workspaceDir}`,
          cause: error,
        }),
      ),
    );
    yield* fs.makeDirectory(scratchDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create workspace scratch directory ${scratchDir}`,
          cause: error,
        }),
      ),
    );
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

    let waitedMillis = 0;
    let reportedWaiting = false;
    while (true) {
      const attempt = yield* Effect.tryPromise({
        try: () =>
          lockfile.lock(workspaceDir, {
            lockfilePath: lockPath,
            realpath: false,
            retries: 0,
            stale: LOCK_STALE_MILLIS,
            update: LOCK_UPDATE_MILLIS,
            // The default handler throws inside a timer: an uncatchable crash
            // that sprays raw frames on stderr. The lock is an advisory
            // serializer; a compromised hold must stay silent here — the
            // workspace transaction owns durable-state safety.
            onCompromised: () => undefined,
          }),
        catch: (cause) => ({ cause, code: errorCode(cause) }),
      }).pipe(Effect.result);
      if (attempt._tag === "Success") {
        const release = attempt.success;
        yield* writeHolder(fs, path, lockPath, args.holder);
        heldTransitions.add(workspaceDir);
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            heldTransitions.delete(workspaceDir);
            yield* fs
              .remove(path.join(lockPath, "holder.json"), { force: true })
              .pipe(Effect.ignore);
            yield* Effect.tryPromise({
              try: () => release(),
              catch: (cause) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to release workspace transition lock at ${lockPath}`,
                  cause,
                }),
            }).pipe(Effect.ignore);
            yield* removeEmptyScratch;
            yield* removeNewEmptyWorkspace;
          }),
        );
        return Option.none<TransitionContention>();
      }
      // ELOCKED is contention outright; any other acquisition error is a race
      // window against the holder's own acquire, release, or staleness sweep
      // (ENOENT/EEXIST from proper-lockfile's internal stat-remove-retry), and
      // the bounded wait absorbs those the same way — the loser serializes or
      // times out into a categorized blocked, never an internal crash.
      const holder = yield* readHolder(fs, path, lockPath);
      if (!reportedWaiting && args.onWaiting !== undefined) {
        reportedWaiting = true;
        yield* args.onWaiting(holder);
      }
      if (waitedMillis >= waitBound) {
        yield* removeEmptyScratch;
        yield* removeNewEmptyWorkspace;
        return Option.some({ holder, waitedMillis });
      }
      yield* Effect.sleep(WAIT_INTERVAL);
      waitedMillis += Duration.toMillis(WAIT_INTERVAL);
    }
  });
