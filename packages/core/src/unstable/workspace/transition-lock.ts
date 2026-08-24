/**
 * Workspace transition lock.
 *
 * One cross-process lock serializes mutation-class operations on a workspace.
 * A plan-family apply acquires it after confirmation — planning, network
 * acquisition, preview, and the confirmation decision stay lock-free — then
 * revalidates its candidate and applies while holding it; the workspace
 * transaction reuses the invocation's hold, or acquires its own when no
 * plan-family hold exists. A contending invocation waits with a visible
 * reason up to a bound, then terminates blocked with a machine-readable
 * reference to the holder.
 *
 * Each acquisition records a distinct owner token in the holder metadata.
 * Ownership is proven only by an exact token match — never inferred from a
 * pid or from missing or unreadable metadata — and a holder write that fails
 * releases the acquisition instead of holding anonymously.
 *
 * The lock file lives at `.axm/tmp/workspace-transition.lock`; its path is
 * load-bearing for operational tooling and must not move casually.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { randomBytes } from "node:crypto";

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as lockfile from "proper-lockfile";

import { makeAppError, type AppError } from "../app-error/index.js";

export const TRANSITION_LOCK_FILENAME = "workspace-transition.lock";
// Staleness must tolerate a saturated event loop: a heavy apply starves the
// mtime-update timer, and a slack smaller than the starvation lets a LIVE
// holder's lock self-declare compromised — after which release refuses and the
// dir is left for the next invocation to wait out. 25 s of slack covers the
// longest observed starvation with room; a crashed holder delays a contender
// at most this long, still inside the 60 s wait bound.
const LOCK_STALE_MILLIS = 30_000;
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
 * What acquisition durably records: the caller's holder description plus the
 * per-acquisition owner token. The token — never the pid, which recurs across
 * reboots and containers — is the only evidence that a residual lock belongs
 * to this acquisition.
 */
interface StoredTransitionHolder extends TransitionLockHolder {
  readonly token: string;
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
): Effect.Effect<Option.Option<TransitionLockHolder & { readonly token?: string }>> =>
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
          ...("token" in parsed && typeof parsed.token === "string" ? { token: parsed.token } : {}),
        });
      }
      return Option.none<TransitionLockHolder & { readonly token?: string }>();
    }),
    Effect.catch(() =>
      Effect.succeed(Option.none<TransitionLockHolder & { readonly token?: string }>()),
    ),
  );

const writeHolder = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  lockPath: string,
  holder: StoredTransitionHolder,
): Effect.Effect<void, AppError> =>
  fs.writeFileString(path.join(lockPath, "holder.json"), JSON.stringify(holder)).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: "internal",
        detail: `Failed to record the workspace transition holder at ${lockPath}`,
        cause: error,
      }),
    ),
  );

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
        const token = randomBytes(16).toString("hex");
        const holderWrite = yield* writeHolder(fs, path, lockPath, {
          ...args.holder,
          token,
        }).pipe(Effect.result);
        if (holderWrite._tag === "Failure") {
          // The holder metadata is the only ownership evidence this
          // acquisition will ever have; holding without it would be
          // indistinguishable from a successor's half-written acquisition.
          // Release the lock and fail rather than hold anonymously.
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
          return yield* holderWrite.failure;
        }
        heldTransitions.add(workspaceDir);
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            heldTransitions.delete(workspaceDir);
            // Removal requires an exact owner-token match, proven before
            // release() — which would remove the directory unconditionally.
            // Absent or unreadable holder metadata is indistinguishable from
            // a successor that reclaimed the stale hold but has not yet
            // written its holder file, and is never license to remove; the
            // unowned in-process bookkeeping self-resolves as compromised on
            // its next update tick without touching the directory.
            const residualHolder = yield* readHolder(fs, path, lockPath);
            const ownsResidual = Option.match(residualHolder, {
              onNone: () => false,
              onSome: (value) => value.token === token,
            });
            if (ownsResidual) {
              yield* Effect.tryPromise({
                try: () => release(),
                catch: (cause) =>
                  makeAppError({
                    code: "internal",
                    detail: `Failed to release workspace transition lock at ${lockPath}`,
                    cause,
                  }),
              }).pipe(Effect.ignore);
              // A compromised hold makes release() refuse; the directory is
              // still ours by exact token match — remove it directly.
              yield* fs.remove(lockPath, { recursive: true, force: true }).pipe(Effect.ignore);
            }
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
