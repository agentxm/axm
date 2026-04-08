/**
 * Subagent selection logic for the install command.
 *
 * Determines which subagents to install based on flags, then optionally
 * prompts the user for confirmation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { SubagentExtensionRef } from "@axm.sh/core/unstable/subagents";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { isNonInteractive } from "@axm.sh/core/unstable/cli-flags";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { expandGlobs } from "@axm.sh/core/unstable/utils";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SelectSubagentsArgs {
  readonly requestedSubagents: readonly string[];
  readonly all: boolean;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Determines which subagents to install from already-discovered subagents.
 *
 * Selection logic:
 * 1. `--subagent` specified -> validate ALL exist, return matches
 * 2. `--all` / `--non-interactive` -> return all (no prompt)
 * 3. Single subagent -> auto-select (no prompt)
 * 4. Multiple subagents -> multiselect prompt
 */
export const determineSubagentsToInstall = (
  subagents: Array.NonEmptyReadonlyArray<SubagentExtensionRef>,
  args: SelectSubagentsArgs,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const nonInteractive = yield* isNonInteractive;

    // 1. --subagent specified -> glob-aware matching
    if (args.requestedSubagents.length > 0) {
      const allNames = Array.map(subagents, (s) => s.subagent.name);
      const matched = expandGlobs(args.requestedSubagents, allNames);

      if (matched.length === 0) {
        return yield* makeAppError({
          code: "NO_SUBAGENTS_MATCHED",
          what: `No subagents matched: ${args.requestedSubagents.join(", ")}`,
          details: [`Available: ${subagents.map((s) => s.subagent.name).join(", ")}`],
          howToFix: "Check the subagent names or patterns and try again.",
        });
      }

      return Array.filter(subagents, (s) => matched.includes(s.subagent.name));
    }

    // 2. --all / --non-interactive -> return all
    if (args.all || nonInteractive) {
      if (args.all) yield* renderer.info(`Installing all ${subagents.length} subagent(s)`);
      return subagents;
    }

    // 3. Single subagent -> auto-select
    if (subagents.length === 1) {
      return subagents;
    }

    // 4. Multiple subagents -> multiselect prompt
    return yield* confirmSubagentsToInstall(subagents);
  });

/**
 * Prompts the user to select which subagents to install from a list.
 *
 * Shows a multiselect prompt with no subagents pre-selected.
 * PromptCancelled bubbles up to the runtime; other errors become AppError.
 */
export const confirmSubagentsToInstall = (
  subagents: Array.NonEmptyReadonlyArray<SubagentExtensionRef>,
) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;

    return yield* prompt
      .multiselect({
        message: "Select subagents to install",
        options: subagents.map((s) => {
          const base = { value: s, label: s.subagent.name };
          return Option.isSome(s.subagent.description)
            ? { ...base, hint: s.subagent.description.value }
            : base;
        }),
        required: true,
      })
      .pipe(
        Effect.mapError((error) =>
          error._tag === "PromptCancelled"
            ? error
            : makeAppError({
                code: "PROMPT_FAILED",
                what: "Failed to prompt for subagent selection",
                cause: error,
              }),
        ),
      );
  });
