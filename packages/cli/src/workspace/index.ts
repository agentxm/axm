/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types
export type { Action, Job, Plan } from "./plan.js";

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
