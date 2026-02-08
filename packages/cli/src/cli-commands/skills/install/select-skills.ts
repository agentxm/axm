/**
 * Skill selection logic for the install command.
 *
 * Determines which skills to install based on flags, then optionally
 * prompts the user for confirmation via `confirmSkillsToInstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { SkillRef } from "../operations.js";
import { Clack } from "../../../clack-effect/index.js";
import { InstallError } from "./handler.js";
import { formatError } from "../../../utils/errors.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SelectSkillsArgs {
  readonly requestedSkills: readonly string[];
  readonly all: boolean;
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Determines which skills to install from already-discovered skills.
 *
 * Selection logic:
 * 1. `--skill` specified -> validate ALL exist, return matches
 * 2. `--all` / `--yes` -> return all (no prompt)
 * 3. Single skill -> auto-select (no prompt)
 * 4. Multiple skills -> `confirmSkillsToInstall` (multiselect prompt)
 */
export const determineSkillsToInstall = (
  skills: Array.NonEmptyReadonlyArray<SkillRef>,
  args: SelectSkillsArgs,
) =>
  Effect.gen(function* () {
    const clack = yield* Clack;

    // 1. --skill specified -> validate all names exist
    if (args.requestedSkills.length > 0) {
      const invalidSkills = Array.filter(
        args.requestedSkills,
        (name) => !skills.some((s) => s.skill.name === name),
      );

      if (invalidSkills.length > 0) {
        return yield* new InstallError({
          message: formatError(
            `Unknown skill(s): ${invalidSkills.join(", ")}`,
            [`Available: ${skills.map((s) => s.skill.name).join(", ")}`],
            "Check the skill names and try again.",
          ),
          cause: undefined,
          retryable: false,
        });
      }

      return Array.filter(skills, (s) => args.requestedSkills.includes(s.skill.name));
    }

    // 2. --all / --yes -> return all
    if (args.all || args.yes) {
      if (args.all) yield* clack.log.info(`Installing all ${skills.length} skill(s)`);
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
 * Shows a multiselect prompt with all skills pre-selected.
 * Maps prompt errors to `InstallError`.
 */
export const confirmSkillsToInstall = (skills: Array.NonEmptyReadonlyArray<SkillRef>) =>
  Effect.gen(function* () {
    const clack = yield* Clack;

    return yield* clack
      .multiselect("Select skills to install", skills, {
        toOption: (s) => ({
          value: s.skill.name,
          label: s.skill.name,
          hint: Option.some(s.skill.description),
        }),
        initialValues: Option.some(Array.map(skills, (s) => s.skill.name)),
        required: Option.some(true),
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new InstallError(
              error._tag === "PromptCancelled"
                ? { message: "Operation cancelled.", cause: undefined, retryable: false }
                : {
                    message: "Failed to prompt for skill selection",
                    cause: error,
                    retryable: false,
                  },
            ),
        ),
      );
  });
