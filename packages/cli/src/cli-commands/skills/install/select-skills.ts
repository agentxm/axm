/**
 * Skill selection logic for the install command.
 *
 * Determines which skills to install based on flags, then optionally
 * prompts the user for confirmation via `confirmSkillsToInstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { DiscoveredSkill } from "./discover-skills.js";
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
  readonly dryRun: boolean;
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
 * 2. `--all` / `--dry-run` / `--yes` -> return all (no prompt)
 * 3. Single skill -> auto-select (no prompt)
 * 4. Multiple skills -> `confirmSkillsToInstall` (multiselect prompt)
 */
export const determineSkillsToInstall = (
  skills: Array.NonEmptyReadonlyArray<DiscoveredSkill>,
  args: SelectSkillsArgs,
) =>
  Effect.gen(function* () {
    const clack = yield* Clack;

    // 1. --skill specified -> validate all names exist
    if (args.requestedSkills.length > 0) {
      const invalidSkills = Array.filter(
        args.requestedSkills,
        (name) => !skills.some((s) => s.name === name),
      );

      if (invalidSkills.length > 0) {
        return yield* new InstallError({
          message: formatError(
            `Unknown skill(s): ${invalidSkills.join(", ")}`,
            [`Available: ${skills.map((s) => s.name).join(", ")}`],
            "Check the skill names and try again.",
          ),
          cause: Option.none(),
          retryable: false,
        });
      }

      return Array.filter(skills, (s) => args.requestedSkills.includes(s.name));
    }

    // 2. --all / --dry-run / --yes -> return all
    if (args.all || args.dryRun || args.yes) {
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
export const confirmSkillsToInstall = (skills: Array.NonEmptyReadonlyArray<DiscoveredSkill>) =>
  Effect.gen(function* () {
    const clack = yield* Clack;

    return yield* clack
      .multiselect("Select skills to install", skills, {
        toOption: (s) => ({
          value: s.name,
          label: s.name,
          hint: Option.some(s.description),
        }),
        initialValues: Option.some(Array.map(skills, (s) => s.name)),
        required: Option.some(true),
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new InstallError(
              error._tag === "PromptCancelled"
                ? { message: "Operation cancelled.", cause: Option.none(), retryable: false }
                : {
                    message: "Failed to prompt for skill selection",
                    cause: Option.some(error),
                    retryable: false,
                  },
            ),
        ),
      );
  });
