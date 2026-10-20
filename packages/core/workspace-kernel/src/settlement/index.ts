/**
 * @agentxm/workspace-kernel/settlement public API.
 *
 * The workspace transaction capability: the process transition lock and the
 * scope that owns it, the transaction runner, the write registration
 * primitives every workspace writer calls, atomic single-file publication,
 * footprint observation, and the typed failure vocabulary. The closure API
 * (`withWorkspaceClosure`, `settleWorkspaceClosure`,
 * `rollbackWorkspaceClosure`, `pendingClosureRestorations`) is exported for
 * `@agentxm/workspace-kernel/planning` alone, which settles each semantic closure;
 * lint refuses it elsewhere. The transaction context and its ledger are not
 * exported.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  createWorkspaceDirectories,
  removeEmptyRuntimeDirectories,
} from "./runtime-directories.js";
export {
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceSnapshotError,
  WorkspaceBoundaryConflict,
  WorkspaceTransitionCompromised,
  type WorkspaceRecoveryEntry,
  type WorkspaceTransactionFailure,
} from "./errors.js";

export { protectCreatedAncestors, protectWorkspacePath } from "./context.js";
export { retireWorkspacePath } from "./retirement.js";

export {
  WorkspaceFileWriteLocks,
  type WorkspaceFileWriteLocksService,
} from "./file-write-locks.js";

export {
  WorkspaceTransactionScope,
  createdWorkspaceDirectories,
  WorkspaceTransactionScopes,
  acquireWorkspaceTransition,
  runWorkspaceTransaction,
} from "./scope.js";

export { type WorkspaceTransitionLock } from "./transition-lock.js";

export {
  pendingClosureRestorations,
  rollbackWorkspaceClosure,
  settleWorkspaceClosure,
  withWorkspaceClosure,
} from "./transaction.js";

export {
  FootprintRecorder,
  isWorkspaceFootprint,
  makeFootprintRecorder,
  readFootprint,
  recordFootprint,
  type FootprintObservation,
} from "./footprint-recorder.js";

// Dependents' inferred types name these, so their declaration emit must be
// able to; knip skips exports tagged public.
/** @public */
export type { WorkspaceTransitionAcquireFailure } from "./errors.js";
