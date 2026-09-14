/** Workspace transaction and admission operations, independent of their storage adapter. */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import type {
  TransitionContention,
  TransitionLockHolder,
  WorkspaceTransactionFailure,
  WorkspaceRestorationIncomplete,
  WorkspaceTransitionAcquireFailure,
} from "./errors.js";

/** Workspace paths a transaction scope is anchored to. */
export interface WorkspaceTransactionPaths {
  readonly workspaceDir: string;
  readonly settingsPath: string;
  readonly lockPath: string;
}

export interface WorkspaceTransactionArgs<A, E = never, R = never> {
  /** Authoritative files or directories that the transition may mutate. */
  readonly targets?: ReadonlyArray<string>;
  /** Desired, lock, canonical, projection, and native-configuration mutation. */
  readonly transition: Effect.Effect<A, E, R>;
  /** Confirms the complete durable postcondition before the transaction commits. */
  readonly validate: (value: A) => Effect.Effect<void, E, R>;
  /** Observes the start of rollback restoration; never controls it. */
  readonly onRestorationStarted?: Effect.Effect<void>;
  /**
   * When `false`, the transaction does not claim the shared settings and
   * lockfile targets up front. A closure-scoped plan apply passes `false`:
   * each closure protects the shared files at its own first touch, so a
   * closure's rollback restores only its own delta and never tears an
   * earlier closure's settled commit out of the shared files. Defaults to
   * `true` — a direct transaction is one closure and claims them itself.
   */
  readonly claimDefaultTargets?: boolean;
}

/** What a post-confirmation apply records as the workspace transition holder. */
export interface WorkspaceTransitionRequest {
  readonly command: string;
  readonly candidateId?: string;
  /** Called once when the invocation starts waiting on another holder. */
  readonly onWaiting?: (holder: Option.Option<TransitionLockHolder>) => Effect.Effect<void>;
}

export interface WorkspaceTransactionScopeService {
  /** Acquire admission for the calling scope; report contention when the wait bound expires. */
  readonly acquire: (
    request: WorkspaceTransitionRequest,
  ) => Effect.Effect<
    Option.Option<TransitionContention>,
    WorkspaceTransitionAcquireFailure,
    Scope.Scope
  >;
  /** Whether this invocation currently holds admission for its workspace. */
  readonly isHeld: Effect.Effect<boolean>;
  readonly run: <A, E, R>(
    args: WorkspaceTransactionArgs<A, E, R>,
  ) => Effect.Effect<A, WorkspaceTransactionFailure | WorkspaceRestorationIncomplete | E, R>;
}

export class WorkspaceTransactionScope extends ServiceMap.Service<
  WorkspaceTransactionScope,
  WorkspaceTransactionScopeService
>()("@agentxm/workspace-transactions/WorkspaceTransactionScope") {}

/** Creates an invocation-owned scope when an application selects a workspace at runtime. */
export class WorkspaceTransactionScopes extends ServiceMap.Service<
  WorkspaceTransactionScopes,
  {
    readonly forWorkspace: (
      paths: WorkspaceTransactionPaths,
    ) => Effect.Effect<WorkspaceTransactionScopeService>;
  }
>()("@agentxm/workspace-transactions/WorkspaceTransactionScopes") {}

/** Admission is held until the calling scope closes. */
export const acquireWorkspaceTransition = (
  request: WorkspaceTransitionRequest,
): Effect.Effect<
  Option.Option<TransitionContention>,
  WorkspaceTransitionAcquireFailure,
  WorkspaceTransactionScope | Scope.Scope
> => Effect.flatMap(WorkspaceTransactionScope, (scope) => scope.acquire(request));

/** Run and validate one coupled mutation; a failed mutation restores its protected targets. */
export const runWorkspaceTransaction = <A, E, R>(
  args: WorkspaceTransactionArgs<A, E, R>,
): Effect.Effect<
  A,
  WorkspaceTransactionFailure | WorkspaceRestorationIncomplete | E,
  R | WorkspaceTransactionScope
> => Effect.flatMap(WorkspaceTransactionScope, (scope) => scope.run(args));
