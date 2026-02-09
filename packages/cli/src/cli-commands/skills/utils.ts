/**
 * Shared utilities for skills commands.
 *
 * This module contains utilities specific to skills commands that are
 * shared across subcommands (install, remove, etc.).
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionRef } from "../../resolution/index.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Select } from "../../tui/index.js";
import { formatEmptyResolutionError, formatError } from "../../utils/errors.js";

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
) {
  return Effect.gen(function* () {
    // Empty results - fail with suggestions
    if (refs.length === 0) {
      return yield* Effect.fail(
        new SkillsError({
          message: formatEmptyResolutionError(input),
          retryable: false,
        }),
      );
    }

    // Single result - use it directly
    if (refs.length === 1) {
      return Option.getOrThrow(Array.head(refs));
    }

    // Multiple results - prompt for selection or fail if non-interactive
    if (!canPrompt) {
      const sources = refs
        .map((r) => `  • ${Option.getOrElse(r.name, () => r.origin)} (${r.source})`)
        .join("\n");
      return yield* Effect.fail(
        new SkillsError({
          message: formatError(
            `Ambiguous input "${input}" matches multiple sources`,
            [`Found ${refs.length} matches:\n${sources}`],
            "Use --yes or --non-interactive with a more specific source identifier.",
          ),
          retryable: false,
        }),
      );
    }

    // Interactive selection
    const select = yield* Select;
    const selected = yield* select
      .prompt({
        message: "Multiple matches found. Select the source to install from:",
        items: refs,
        toOption: (ref) => ({
          label: Option.getOrElse(ref.name, () => ref.origin),
          hint: Option.some(
            `${ref.source}${Option.match(ref.ref, { onNone: () => "", onSome: (r) => `@${r}` })}`,
          ),
        }),
      })
      .pipe(
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
