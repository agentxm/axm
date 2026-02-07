/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types
export type { Action, Job, Operation, Plan } from "./plan.js";

// Plan display
export { displayPlan } from "./display-plan.js";

// Plan apply
export {
  applyPlan,
  OperationError,
  type ExecutionContext,
  type Handlers,
  type OperationHandler,
  type OperationResult,
} from "./apply-plan.js";

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
