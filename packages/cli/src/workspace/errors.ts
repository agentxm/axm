/**
 * Workspace context error types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";

/**
 * Error when workspace has not been initialized.
 *
 * Thrown when attempting to load a local workspace context but no settings.json exists.
 * Users should run 'axm init' to initialize the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WorkspaceNotInitializedError extends Data.TaggedError("WorkspaceNotInitializedError")<{
  readonly path: string;
}> {
  override get message() {
    return `Workspace not initialized at ${this.path}. Run 'axm init' first.`;
  }
}

/**
 * Error during workspace initialization.
 *
 * Thrown when workspace initialization fails (e.g., when non-interactive mode
 * is enabled but user input would be required).
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WorkspaceInitializationError extends Data.TaggedError("WorkspaceInitializationError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}
