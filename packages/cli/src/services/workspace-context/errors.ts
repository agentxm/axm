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
