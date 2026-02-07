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
// Plan execution
// Context (deprecated - use WorkspaceContext service instead)
// Ideal state building
// State loading
// Plan building

// Agent resolution

// Path utilities
export { getAxmDir, getGlobalDir, getProjectDir } from "./paths.js";

// Workspace context service (for CLI commands)
export { WorkspaceInitializationError, WorkspaceNotInitializedError } from "./errors.js";
export {
  layer,
  type WorkspaceContextService,
  type WorkspaceContextError,
  type WorkspaceContextOptions,
  Workspace as WorkspaceContextTag,
} from "./service.js";
