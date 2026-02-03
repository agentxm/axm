/**
 * Shared utilities for skills commands.
 *
 * This module contains utilities specific to skills commands that are
 * shared across subcommands (install, remove, etc.).
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionRef } from "@agentxm/core/experimental/resolution";
import { Data, Effect } from "effect";
import { formatEmptyResolutionError, formatError } from "../../utils/errors.js";
import { promptSelect } from "../../utils/prompts.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Error that occurs during skills operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SkillsError extends Data.TaggedError("SkillsError")<{
  readonly message: string;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// Extension Reference Selection
// -----------------------------------------------------------------------------

/**
 * Selects a single extension reference from resolution results.
 *
 * Handles three cases:
 * 1. Empty results - fails with suggestions for valid input formats
 * 2. Single result - returns it directly
 * 3. Multiple results - prompts for selection or fails in non-interactive mode
 *
 * @param refs - Extension references from resolution
 * @param input - Original input string for error messages
 * @param canPrompt - Whether interactive prompts are available
 * @returns Effect that succeeds with selected ExtensionRef or fails with SkillsError
 *
 * @experimental This API is unstable and may change without notice.
 */
export function selectExtensionRef(
  refs: readonly ExtensionRef[],
  input: string,
  canPrompt: boolean,
): Effect.Effect<ExtensionRef, SkillsError> {
  return Effect.gen(function* () {
    // Empty results - fail with suggestions
    if (refs.length === 0) {
      return yield* new SkillsError({
        message: formatEmptyResolutionError(input),
        retryable: false,
      });
    }

    // Single result - use it directly
    if (refs.length === 1) {
      const ref = refs[0];
      if (!ref) {
        return yield* new SkillsError({
          message: formatEmptyResolutionError(input),
          retryable: false,
        });
      }
      return ref;
    }

    // Multiple results - prompt for selection or fail if non-interactive
    if (!canPrompt) {
      const sources = refs.map((r) => `  \u2022 ${r.name ?? r.origin} (${r.source})`).join("\n");
      return yield* new SkillsError({
        message: formatError(
          `Ambiguous input "${input}" matches multiple sources`,
          [`Found ${refs.length} matches:\n${sources}`],
          "Use --yes or --non-interactive with a more specific source identifier.",
        ),
        retryable: false,
      });
    }

    // Interactive selection
    const selected = yield* promptSelect(
      "Multiple matches found. Select the source to install from:",
      refs,
      (ref) => ({
        value: ref.origin,
        label: ref.name ?? ref.origin,
        hint: `${ref.source}${ref.ref ? `@${ref.ref}` : ""}`,
      }),
    ).pipe(
      Effect.mapError(
        (error) =>
          new SkillsError({
            message: `Failed to prompt for extension selection: ${error.message}`,
            retryable: false,
          }),
      ),
    );

    return selected;
  });
}
