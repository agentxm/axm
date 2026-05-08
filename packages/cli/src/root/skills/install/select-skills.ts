/**
 * Skill selection logic for the install command.
 *
 * Determines which skills to install based on flags, then optionally
 * prompts the user for confirmation via `confirmSkillsToInstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import type { SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";
import { isNonInteractive } from "@agentxm/client-core/unstable/cli-flags";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { PromptCancelled } from "@agentxm/client-core/unstable/prompt-cancelled";
import { expandGlobs } from "@agentxm/client-core/unstable/utils";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
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
  ) => Effect.Effect<
    ReadonlyArray<SkillExtensionRef>,
    PromptCancelled | AppError,
    FileSystem.FileSystem | Path.Path | Terminal.Terminal
  >;
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
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const terminal = yield* Terminal.Terminal;
    const promptEnvironment = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fileSystem),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Terminal.Terminal, terminal),
    );

    return yield* requireInteractive(
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
    ).pipe(Effect.provide(promptEnvironment));
  });
};

export const confirmSkillsToInstall = (
  skills: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
  selectSkills: SelectSkillsInteractions["selectSkills"] = selectSkillsPrompt,
) => selectSkills(skills);
