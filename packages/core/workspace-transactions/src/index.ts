/**
 * @agentxm/workspace-transactions public API.
 *
 * The workspace transaction capability: the process transition lock and the
 * scope that owns it, the transaction runner, the write registration
 * primitives every workspace writer calls, atomic single-file publication,
 * footprint observation, and the typed failure vocabulary. The closure API
 * (`withWorkspaceClosure`, `settleWorkspaceClosure`,
 * `rollbackWorkspaceClosure`, `pendingClosureRestorations`) is exported for
 * `@agentxm/workspace-operations` alone, which settles each semantic closure;
 * lint refuses it elsewhere. The transaction context and its ledger are not
 * exported.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceSnapshotError,
  WorkspaceTransitionCompromised,
  type TransitionContention,
  type TransitionLockHolder,
  type WorkspaceTransactionFailure,
  type WorkspaceTransitionAcquireFailure,
} from "./errors.js";

export { protectCreatedAncestors, protectWorkspacePath } from "./context.js";

export {
  WorkspaceTransactionScope,
  acquireWorkspaceTransition,
  makeWorkspaceTransactionScope,
  type WorkspaceTransactionPaths,
  type WorkspaceTransactionScopeService,
  type WorkspaceTransitionRequest,
} from "./scope.js";

export {
  TRANSITION_WAIT_BOUND_MILLIS,
  makeWorkspaceTransitionLock,
  transitionLockPath,
  type AcquireWorkspaceTransitionArgs,
  type HeldWorkspaceTransition,
  type WorkspaceTransitionLock,
} from "./transition-lock.js";

export {
  pendingClosureRestorations,
  rollbackWorkspaceClosure,
  runWorkspaceTransaction,
  settleWorkspaceClosure,
  withWorkspaceClosure,
  type WorkspaceTransactionArgs,
} from "./transaction.js";

export type { PendingClosureRestoration } from "./ledger.js";

export {
  FootprintRecorder,
  makeFootprintRecorder,
  readFootprint,
  recordFootprint,
  type FootprintObservation,
} from "./footprint-recorder.js";

export {
  atomicWriteTempPrefix,
  sweepStaleAtomicWriteTemps,
  writeFileAtomic,
  type AtomicWriteFailure,
  type AtomicWriteStep,
  type SkipIfUnchanged,
  type WriteFileAtomicOptions,
} from "./atomic-write.js";
