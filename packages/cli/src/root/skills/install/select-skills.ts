/**
 * Skill selection logic for the install command.
 *
 * Determines which skills to install based on flags, then optionally
 * prompts the user for confirmation via `confirmSkillsToInstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { SkillExtensionRef } from "@axm.sh/core/unstable/skills";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { fromInteractivePrompt } from "@axm.sh/core/unstable/cli/prompt";
import { isNonInteractive } from "@axm.sh/core/unstable/cli-flags";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";
import { expandGlobs } from "@axm.sh/core/unstable/utils";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Prompt } from "effect/unstable/cli";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SelectSkillsArgs {
  readonly requestedSkills: readonly string[];
  readonly all: boolean;
}

interface SelectSkillsInteractions {
  readonly selectSkills?: (
    skills: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
  ) => Effect.Effect<ReadonlyArray<SkillExtensionRef>, PromptCancelled | AppError>;
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
  interactions?: SelectSkillsInteractions,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const nonInteractive = yield* isNonInteractive;

    // 1. --skill specified -> glob-aware matching
    if (args.requestedSkills.length > 0) {
      const allNames = Array.map(skills, (s) => s.skill.name);
      const matched = expandGlobs(args.requestedSkills, allNames);

      if (matched.length === 0) {
        return yield* makeAppError({
          code: "NO_SKILLS_MATCHED",
          what: `No skills matched: ${args.requestedSkills.join(", ")}`,
          details: [`Available: ${skills.map((s) => s.skill.name).join(", ")}`],
          howToFix: "Check the skill names or patterns and try again.",
        });
      }

      return Array.filter(skills, (s) => matched.includes(s.skill.name));
    }

    // 2. --all / --non-interactive -> return all
    if (args.all || nonInteractive) {
      if (args.all) yield* renderer.info(`Installing all ${skills.length} skill(s)`);
      return skills;
    }

    // 3. Single skill -> auto-select
    if (skills.length === 1) {
      return skills;
    }

    // 4. Multiple skills -> multiselect prompt
    return yield* confirmSkillsToInstall(skills, interactions?.selectSkills);
  });

/**
 * Prompts the user to select which skills to install from a list.
 *
 * Shows a multiselect prompt with no skills pre-selected.
 * PromptCancelled bubbles up to the runtime; other errors become AppError.
 */
const selectSkillsPrompt = (skills: Array.NonEmptyReadonlyArray<SkillExtensionRef>) => {
  const message = "Select skills to install";
  return fromInteractivePrompt(
    Prompt.multiSelect({
      message,
      choices: skills.map((skill) => ({
        title: skill.skill.name,
        value: skill,
        ...(Option.isSome(skill.skill.description)
          ? { description: skill.skill.description.value }
          : {}),
      })),
      min: 1,
    }),
    { message },
  );
};

export const confirmSkillsToInstall = (
  skills: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
  selectSkills: SelectSkillsInteractions["selectSkills"] = selectSkillsPrompt,
) => selectSkills(skills);
