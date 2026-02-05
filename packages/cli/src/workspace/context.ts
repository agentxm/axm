/**
 * Workspace context for skills operations.
 *
 * Provides a simple interface that encapsulates workspace location (local vs global)
 * and interaction mode. Passed to workspace functions to determine behavior.
 *
 * @deprecated Use WorkspaceContext service from service.ts instead.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { getAxmDir, SETTINGS_FILENAME } from "./paths.js";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error representing a workspace-level problem.
 *
 * @deprecated Use WorkspaceNotInitializedError or WorkspaceInitializationError from errors.ts instead.
 */
export class WorkspaceErrorLegacy extends Data.TaggedError("WorkspaceError")<{
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
 * handler options via makeWorkspaceContextLegacy.
 *
 * @deprecated Use WorkspaceContextService from service-types.ts instead.
 */
export interface WorkspaceContextLegacy {
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
 * @returns WorkspaceContextLegacy for use with workspace functions
 *
 * @deprecated Use WorkspaceContext.layer() from service.ts instead.
 *
 * @example
 * ```typescript
 * import { makeWorkspaceContextLegacy } from "./workspace/context";
 *
 * // Local workspace with prompts enabled
 * const localCtx = makeWorkspaceContextLegacy({ global: false, interactive: true });
 *
 * // Global workspace in CI mode (no prompts)
 * const globalCtx = makeWorkspaceContextLegacy({ global: true, interactive: false });
 * ```
 */
export const makeWorkspaceContextLegacy = (options: {
  global: boolean;
  interactive: boolean;
}): WorkspaceContextLegacy => ({
  path: getAxmDir(options.global),
  interactive: options.interactive,
});

/**
 * Ensure workspace is initialized.
 *
 * Checks if the workspace path exists and contains a valid settings.json file.
 * If not initialized:
 * - In non-interactive mode: fails with WorkspaceErrorLegacy
 * - In interactive mode: fails with WorkspaceErrorLegacy (future: could prompt for initialization)
 *
 * @param ws - Workspace context containing path and interaction mode
 * @returns Effect that succeeds if initialized, fails with WorkspaceErrorLegacy if not
 *
 * @deprecated Use WorkspaceContext service which handles initialization automatically.
 *
 * @example
 * ```typescript
 * import { ensureInitLegacy, makeWorkspaceContextLegacy } from "./workspace/context";
 * import { Effect } from "effect";
 *
 * const handler = Effect.gen(function* () {
 *   const ws = makeWorkspaceContextLegacy({ global: false, interactive: true });
 *   yield* ensureInitLegacy(ws);
 *   // ... proceed with workspace operations
 * });
 * ```
 */
export const ensureInitLegacy = (
  ws: WorkspaceContextLegacy,
): Effect.Effect<void, WorkspaceErrorLegacy, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const settingsPath = `${ws.path}/${SETTINGS_FILENAME}`;

    // Check if settings.json exists
    const exists = yield* fs
      .exists(settingsPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!exists) {
      return yield* new WorkspaceErrorLegacy({
        message: `Workspace not initialized. Run 'axm init' first. (${ws.path})`,
        cause: Option.none(),
      });
    }
  });
