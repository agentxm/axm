/**
 * Typed failure vocabulary of the workspace transaction and transition-lock
 * machinery, plus the holder and contention facts the lock records. The
 * application error boundary owns rendering, codes, and suggestions for every
 * failure declared here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import type * as Option from "effect/Option";

/** Identity an invocation records while it holds the workspace transition. */
export interface TransitionLockHolder {
  readonly command: string;
  readonly pid: number;
  readonly candidateId?: string;
}

export interface TransitionContention {
  /** The holder recorded by the invocation that owns the lock, when readable. */
  readonly holder: Option.Option<TransitionLockHolder>;
  readonly waitedMillis: number;
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

/**
 * Registering a path with the active transaction failed: the pre-mutation
 * preimage could not be taken, so the path was never mutated. `target` is the
 * path being protected; the `create-store` step's message interpolates
 * nothing.
 */
export class WorkspaceSnapshotError extends Data.TaggedError("WorkspaceSnapshotError")<{
  readonly target: string;
  readonly step: "inspect-target" | "create-store" | "copy" | "inspect-ancestor";
  readonly cause: unknown;
}> {}

/** Preparing the workspace state directory for a transition failed. */
export class WorkspaceDirectoryError extends Data.TaggedError("WorkspaceDirectoryError")<{
  readonly path: string;
  readonly step: "inspect" | "create";
  readonly cause: unknown;
}> {}

/**
 * Workspace transition-lock mechanics failed. `path` carries the fact each
 * step's message interpolates: the scratch directory for `create-scratch`,
 * the lock path otherwise. `missing-timestamp` has no underlying cause.
 */
export class TransitionLockError extends Data.TaggedError("TransitionLockError")<{
  readonly path: string;
  readonly step:
    | "create-scratch"
    | "acquire"
    | "record-holder"
    | "inspect-timestamp"
    | "missing-timestamp"
    | "preserve-timestamp"
    | "release";
  readonly cause?: unknown;
}> {}

/**
 * The bounded contention wait elapsed while another invocation held the
 * workspace transition.
 */
export class TransitionLockUnavailable extends Data.TaggedError("TransitionLockUnavailable")<{
  readonly holder: TransitionLockHolder | undefined;
  readonly waitedMillis: number;
}> {}

/**
 * The hold is no longer provably owned: ownership could not be confirmed
 * within the staleness window, so a contender may already have reclaimed the
 * lock. Any further durable write by the original owner — mutation and
 * restoration alike — could overwrite a successor's work.
 */
export class WorkspaceTransitionCompromised extends Data.TaggedError(
  "WorkspaceTransitionCompromised",
)<{
  readonly workspaceDir: string;
  readonly lockPath: string;
  readonly cause: unknown;
}> {}

/**
 * One restoration step did not complete or verify. Never a channel failure:
 * it travels as the `restorationCause` inside
 * {@link WorkspaceRestorationIncomplete} and the pending closure records.
 */
export class WorkspaceRestorationError extends Data.TaggedError("WorkspaceRestorationError")<{
  readonly target: string;
  readonly step: "stage" | "stopped" | "verify";
  readonly cause: unknown;
}> {}

/** Failures acquiring the workspace transition lock. */
export type WorkspaceTransitionAcquireFailure = WorkspaceDirectoryError | TransitionLockError;

/** Failures the transaction machinery itself produces, beside the transition's own. */
export type WorkspaceTransactionFailure =
  | WorkspaceSnapshotError
  | WorkspaceDirectoryError
  | TransitionLockError
  | TransitionLockUnavailable
  | WorkspaceTransitionCompromised;
