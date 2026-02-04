/**
 * Workspace module - desired-state reconciliation for skills management.
 *
 * This module implements an Arborist-style reconciliation pattern:
 * - `loadCurrentState` - reads actual disk + lockfile state
 * - `buildIdealState` - computes desired state from current + command
 * - `buildPlan` - diffs current vs ideal to produce execution steps
 * - `applyPlan` - executes or displays the plan
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Re-export V2 types from skills/state/types.ts
export type { CurrentState, IdealState } from "../skills/state/types.js";
// SkillSourceV2 is both a type and a value (constructors object)
// Export only once - the value export makes the type available too
export { SkillSourceV2 } from "../skills/state/types.js";
// Re-export types from apply.ts (which re-exports from types.ts)
export type { ApplyResult, Plan, PlanStep } from "./apply.js";
// Plan execution
export {
  type ApplyDeps,
  ApplyError,
  type ApplyOptions,
  type ApplyStepOptions,
  applyPlan,
  applyStep,
  displayPlan,
  emptyApplyResult,
  updateLockfileForPlan,
  updateSettingsForPlan,
} from "./apply.js";
export type { WorkspaceContext } from "./context.js";
// Context
export { ensureInit, makeWorkspaceContext, WorkspaceError } from "./context.js";
// Ideal state building
export {
  type BuildIdealDeps,
  type BuildIdealStateDeps,
  type BuildIdealUpdateDeps,
  buildIdealForInstall,
  buildIdealForUninstall,
  buildIdealForUpdate,
  buildIdealState,
  type Command,
  CommandError,
  type DiscoveredSkill,
  type InstallCommand,
  sourcesEqual,
  type UninstallCommand,
  type UpdateCommand,
} from "./ideal-state.js";
// State loading
export { loadCurrentState } from "./load-state.js";
// Plan building
export { buildPlan, getPlanSummary, type PlanSummary, planHasChanges } from "./plan.js";
