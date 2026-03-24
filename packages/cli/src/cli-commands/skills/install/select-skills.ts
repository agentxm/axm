/**
 * Skill selection logic for the install command.
 *
 * Determines which skills to install based on flags, then optionally
 * prompts the user for confirmation via `confirmSkillsToInstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { SkillExtensionRef } from "../../../sources/index.js";
import { Log, Multiselect } from "../../../clack-effect/index.js";
import { CliFlags } from "../../../cli-flags/index.js";
import { makeAppError } from "../../../app-error/index.js";
import { expandGlobs } from "../../../skills/index.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SelectSkillsArgs {
  readonly requestedSkills: readonly string[];
  readonly all: boolean;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Determines which skills to install from already-discovered skills.
 *
 * Selection logic:
 * 1. `--skill` specified -> validate ALL exist, return matches
 * 2. `--all` / `--non-interactive` -> return all (no prompt)
 * 3. Single skill -> auto-select (no prompt)
 * 4. Multiple skills -> `confirmSkillsToInstall` (multiselect prompt)
 */
export const determineSkillsToInstall = (
  skills: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
  args: SelectSkillsArgs,
) =>
  Effect.gen(function* () {
    const log = yield* Log;
    const flags = yield* CliFlags;

    // 1. --skill specified -> glob-aware matching
    if (args.requestedSkills.length > 0) {
      const allNames = Array.map(skills, (s) => s.skill.name);
      const matched = expandGlobs(args.requestedSkills, allNames);

      if (matched.length === 0) {
        return yield* Effect.fail(
          makeAppError({
            code: "NO_SKILLS_MATCHED",
            what: `No skills matched: ${args.requestedSkills.join(", ")}`,
            details: [`Available: ${skills.map((s) => s.skill.name).join(", ")}`],
            howToFix: "Check the skill names or patterns and try again.",
          }),
        );
      }

      return Array.filter(skills, (s) => matched.includes(s.skill.name));
    }

    // 2. --all / --non-interactive -> return all
    if (args.all || flags.nonInteractive) {
      if (args.all) yield* log.info(`Installing all ${skills.length} skill(s)`);
      return skills;
    }

    // 3. Single skill -> auto-select
    if (skills.length === 1) {
      return skills;
    }

    // 4. Multiple skills -> multiselect prompt
    return yield* confirmSkillsToInstall(skills);
  });

/**
 * Prompts the user to select which skills to install from a list.
 *
 * Shows a multiselect prompt with no skills pre-selected.
 * PromptCancelled bubbles up to the runtime; other errors become AppError.
 */
export const confirmSkillsToInstall = (skills: Array.NonEmptyReadonlyArray<SkillExtensionRef>) =>
  Effect.gen(function* () {
    const multiselect = yield* Multiselect;

    return yield* multiselect
      .prompt({
        message: "Select skills to install",
        items: skills,
        toOption: (s) => ({
          value: s.skill.name,
          label: s.skill.name,
          hint: s.skill.description,
        }),
        initialValues: Option.none(),
        required: Option.some(true),
      })
      .pipe(
        Effect.mapError((error) =>
          error._tag === "PromptCancelled"
            ? error
            : makeAppError({
                code: "PROMPT_FAILED",
                what: "Failed to prompt for skill selection",
                cause: error,
              }),
        ),
      );
  });
