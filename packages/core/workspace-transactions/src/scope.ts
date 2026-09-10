/**
 * The workspace transaction scope: the one service a transaction runs
 * against. It names the workspace's state directory and its two shared
 * authoritative files, owns the process transition lock for that workspace,
 * and holds the in-process admission permit that serializes transactions of
 * one runtime. The workspace-state live layer provides it from the workspace
 * location; tests provide an in-memory one through `./testing`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";

import type {
  TransitionContention,
  TransitionLockHolder,
  WorkspaceTransitionAcquireFailure,
} from "./errors.js";
import { makeWorkspaceTransitionLock, type WorkspaceTransitionLock } from "./transition-lock.js";

/** Workspace paths a transaction scope is anchored to. */
export interface WorkspaceTransactionPaths {
  /** The scope's runtime state directory (`.axm`), which also hosts the lock. */
  readonly workspaceDir: string;
  readonly settingsPath: string;
  readonly lockPath: string;
}

export interface WorkspaceTransactionScopeService extends WorkspaceTransactionPaths {
  /** Cross-process admission for this workspace, owned by this scope. */
  readonly lock: WorkspaceTransitionLock;
  /**
   * In-process admission distinct from any writer mutex: a transaction calls
   * workspace writers while it owns this permit.
   */
  readonly admission: Semaphore.Semaphore;
}

export class WorkspaceTransactionScope extends ServiceMap.Service<
  WorkspaceTransactionScope,
  WorkspaceTransactionScopeService
>()("@agentxm/workspace-transactions/WorkspaceTransactionScope") {
  /** The production scope: a process lock over the workspace's scratch directory. */
  static readonly layer = (
    paths: WorkspaceTransactionPaths,
  ): Layer.Layer<WorkspaceTransactionScope> =>
    Layer.effect(WorkspaceTransactionScope, makeWorkspaceTransactionScope(paths));
}

/**
 * Build one scope over the given paths. The lock defaults to the process
 * lock; tests pass an in-memory one.
 */
export const makeWorkspaceTransactionScope = (
  paths: WorkspaceTransactionPaths,
  lock?: WorkspaceTransitionLock,
): Effect.Effect<WorkspaceTransactionScopeService> =>
  Effect.gen(function* () {
    const admission = yield* Semaphore.make(1);
    return {
      workspaceDir: paths.workspaceDir,
      settingsPath: paths.settingsPath,
      lockPath: paths.lockPath,
      lock: lock ?? (yield* makeWorkspaceTransitionLock),
      admission,
    };
  });

/** What a post-confirmation apply records as the workspace transition holder. */
export interface WorkspaceTransitionRequest {
  readonly command: string;
  readonly candidateId?: string;
  /** Called once when the invocation starts waiting on another holder. */
  readonly onWaiting?: (holder: Option.Option<TransitionLockHolder>) => Effect.Effect<void>;
}

/**
 * Acquire the workspace transition for the calling scope's lifetime. Resolves
 * `None` when acquired (release is a scope finalizer) and `Some(contention)`
 * when the wait bound elapsed while another invocation held it.
 */
export const acquireWorkspaceTransition = (
  request: WorkspaceTransitionRequest,
): Effect.Effect<
  Option.Option<TransitionContention>,
  WorkspaceTransitionAcquireFailure,
  WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.flatMap(WorkspaceTransactionScope, (scope) =>
    scope.lock.acquire({
      workspaceDir: scope.workspaceDir,
      holder: {
        command: request.command,
        pid: process.pid,
        ...(request.candidateId === undefined ? {} : { candidateId: request.candidateId }),
      },
      ...(request.onWaiting === undefined ? {} : { onWaiting: request.onWaiting }),
    }),
  );
