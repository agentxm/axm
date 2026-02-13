/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types
export type {
  Job,
  JobStep,
  JobStepResult,
  Operation,
  OperationResult,
  Plan,
  PlannedJobStep,
} from "./plan.js";

// Plan display
export { displayPlan } from "./display-plan.js";

// Plan apply
export {
  applyPlan,
  type ExecutionContext,
  type Handlers,
  type OperationHandler,
} from "./apply-plan.js";

// Path utilities
export { getAxmDir, getGlobalDir, getProjectDir } from "./paths.js";

// Workspace context service (for CLI commands)
export {
  layer,
  type WorkspaceContextService,
  type WorkspaceContextError,
  type WorkspaceContextOptions,
  Workspace as Workspace,
} from "./service.js";
