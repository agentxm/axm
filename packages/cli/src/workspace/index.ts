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
export type { WorkspaceContextLegacy } from "./context-legacy.js";
// Context (deprecated - use WorkspaceContext service instead)
export {
  ensureInitLegacy,
  makeWorkspaceContextLegacy,
  WorkspaceErrorLegacy,
} from "./context-legacy.js";
// Ideal state building
export {
  type AddSkillOperation,
  type BuildIdealDeps,
  type BuildIdealStateDeps,
  type BuildIdealUpdateDeps,
  buildIdealForInstall,
  buildIdealForUninstall,
  buildIdealForUpdate,
  buildIdealFromOperations,
  buildIdealState,
  type Command,
  CommandError,
  type DiscoveredSkill,
  type InstallCommand,
  type RemoveSkillOperation,
  sourcesEqual,
  type UninstallCommand,
  type UpdateCommand,
  type WorkspaceOperation,
} from "./ideal-state.js";
// State loading
export { loadCurrentState } from "./load-state.js";
// Plan building
export { buildPlan, getPlanSummary, type PlanSummary, planHasChanges } from "./plan.js";

// Agent resolution
export {
  ensureAgentsConfigured,
  EnsureAgentsError,
  type EnsureAgentsOptions,
} from "./ensure-agents.js";

// Path utilities
export { getAxmDir, getGlobalDir, getProjectDir } from "./paths.js";

// Workspace context service (for CLI commands)
export { WorkspaceInitializationError, WorkspaceNotInitializedError } from "./errors.js";
export type { WorkspaceContextService } from "./service-types.js";
export {
  layer,
  WorkspaceContext as WorkspaceContextTag,
  type WorkspaceContextError,
  type WorkspaceContextOptions,
} from "./service.js";
