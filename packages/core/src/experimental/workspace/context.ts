/**
 * Workspace context for skills operations.
 *
 * Provides a simple interface that encapsulates workspace location (local vs global)
 * and interaction mode. Passed to workspace functions to determine behavior.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { getAxmDir } from "../paths.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const SETTINGS_FILENAME = "settings.json";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error representing a workspace-level problem.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WorkspaceError extends Data.TaggedError("WorkspaceError")<{
  readonly message: string;
  readonly cause?: Option.Option<unknown>;
}> {}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Workspace context - passed to workspace functions.
 *
 * Encapsulates the workspace root path and interaction mode. Created from
 * handler options via makeWorkspaceContext.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContext {
  /** Workspace root path (e.g., .axm/ or ~/.axm/) */
  readonly path: string;

  /** Whether user prompts are allowed */
  readonly interactive: boolean;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Create workspace context from handler options.
 *
 * Determines the workspace path based on the global flag:
 * - Local workspace: `.axm/` in current directory
 * - Global workspace: `~/.axm/`
 *
 * @param options - Handler options containing global and interactive flags
 * @returns WorkspaceContext for use with workspace functions
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { makeWorkspaceContext } from "@agentxm/core/experimental/workspace/context";
 *
 * // Local workspace with prompts enabled
 * const localCtx = makeWorkspaceContext({ global: false, interactive: true });
 *
 * // Global workspace in CI mode (no prompts)
 * const globalCtx = makeWorkspaceContext({ global: true, interactive: false });
 * ```
 */
export const makeWorkspaceContext = (options: {
  global: boolean;
  interactive: boolean;
}): WorkspaceContext => ({
  path: getAxmDir(options.global),
  interactive: options.interactive,
});

/**
 * Ensure workspace is initialized.
 *
 * Checks if the workspace path exists and contains a valid settings.json file.
 * If not initialized:
 * - In non-interactive mode: fails with WorkspaceError
 * - In interactive mode: fails with WorkspaceError (future: could prompt for initialization)
 *
 * @param ws - Workspace context containing path and interaction mode
 * @returns Effect that succeeds if initialized, fails with WorkspaceError if not
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { ensureInit, makeWorkspaceContext } from "@agentxm/core/experimental/workspace/context";
 * import { Effect } from "effect";
 *
 * const handler = Effect.gen(function* () {
 *   const ws = makeWorkspaceContext({ global: false, interactive: true });
 *   yield* ensureInit(ws);
 *   // ... proceed with workspace operations
 * });
 * ```
 */
export const ensureInit = (
  ws: WorkspaceContext,
): Effect.Effect<void, WorkspaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const settingsPath = `${ws.path}/${SETTINGS_FILENAME}`;

    // Check if settings.json exists
    const exists = yield* fs
      .exists(settingsPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!exists) {
      return yield* new WorkspaceError({
        message: `Workspace not initialized. Run 'axm init' first. (${ws.path})`,
        cause: Option.none(),
      });
    }
  });
