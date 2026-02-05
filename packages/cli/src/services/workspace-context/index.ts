/**
 * Workspace context service.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { WorkspaceNotInitializedError } from "./errors.js";
export {
  layer,
  make,
  WorkspaceContext,
  type WorkspaceContextError,
  type WorkspaceContextOptions,
} from "./service.js";
export type { WorkspaceContextService } from "./types.js";
