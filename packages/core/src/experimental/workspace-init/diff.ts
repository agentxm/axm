/**
 * Diff computation for workspace initialization.
 *
 * Computes the change between actual and ideal initialization state.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { ActualInitState, IdealInitState, InitDiff } from "./types.js";
import { InitChange } from "./types.js";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when workspace has invalid settings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class InvalidWorkspaceError extends Data.TaggedError("InvalidWorkspaceError")<{
  readonly message: string;
}> {}

// =============================================================================
// Options
// =============================================================================

/**
 * Options for computing the initialization diff.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ComputeInitDiffOptions {
  readonly force: boolean;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Compute the change between actual and ideal initialization state.
 *
 * Change types:
 * - Add: Workspace not initialized (create new settings.json)
 * - Update: Workspace valid but force is true (overwrite settings.json)
 * - Unchanged: Workspace already initialized (no changes without force)
 *
 * Fails with InvalidWorkspaceError when settings exist but are invalid.
 *
 * @param actual - Current initialization state (what's on disk)
 * @param ideal - Desired initialization state
 * @param options - Diff computation options (force flag)
 * @returns Effect yielding the InitDiff to apply
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeInitDiff = (
  actual: ActualInitState,
  ideal: IdealInitState,
  options: ComputeInitDiffOptions,
): Effect.Effect<InitDiff, InvalidWorkspaceError> => {
  const { validity } = actual;
  const { force } = options;

  switch (validity._tag) {
    case "NotInitialized":
      // Workspace not initialized -> Add
      return Effect.succeed({ change: InitChange.Add(ideal) });

    case "Valid":
      // Workspace is valid
      if (force) {
        // Force flag -> Update
        return Effect.succeed({ change: InitChange.Update(validity.settings, ideal) });
      }
      // No force -> Unchanged
      return Effect.succeed({ change: InitChange.Unchanged(validity.settings) });

    case "Invalid":
      // Invalid settings -> fail with error
      return Effect.fail(
        new InvalidWorkspaceError({
          message: `Workspace has invalid settings: ${validity.error}`,
        }),
      );
  }
};
