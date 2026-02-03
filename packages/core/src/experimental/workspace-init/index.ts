/**
 * Workspace initialization module.
 *
 * Provides state-based initialization for axm workspaces.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { ApplyInitError, type ApplyInitOptions, applyInitDiff } from "./apply.js";
export {
  type ComputeInitDiffOptions,
  computeInitDiff,
  InvalidWorkspaceError,
} from "./diff.js";

export { buildIdealInitState, loadActualInitState } from "./state.js";
// Types
export type {
  ActualInitState,
  IdealInitState,
  InitChange,
  InitDiff,
  InitValidity,
} from "./types.js";
// Constructors and utilities
export {
  hasInitChanges,
  InitChange as InitChangeConstructors,
  InitValidity as InitValidityConstructors,
} from "./types.js";
