/**
 * Skill selection logic for the install command.
 *
 * Determines which skills to install based on flags, then optionally
 * prompts the user for confirmation via `confirmSkillsToInstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { DiscoveredSkill } from "../../../extensions/skills/index.js";
import type { ResolvedSource } from "./handler.js";
import { Clack } from "../../../clack-effect/index.js";
import { InstallError } from "./handler.js";
import { formatError } from "../../../utils/errors.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface DetermineSkillsToInstallArgs<R = never> {
  readonly discover: Effect.Effect<
    { skills: DiscoveredSkill[]; resolvedSource: ResolvedSource },
    InstallError,
    R
  >;
  readonly sourceLabel: string;
  readonly requestedSkills: readonly string[];
  readonly all: boolean;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly list: boolean;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Discovers and determines which skills to install based on flags.
 *
 * Flow:
 * 1. Discover skills from source (via callback)
 * 2. Validate non-empty
 * 3. List mode -> return all skills with `list: true`
 * 4. Selection logic:
 *    a. `--skill` specified -> validate ALL exist, return matches
 *    b. `--all` / `--dry-run` / `--yes` -> return all (no prompt)
 *    c. Single skill -> auto-select (no prompt)
 *    d. Multiple skills -> `confirmSkillsToInstall` (multiselect prompt)
 */
export const determineSkillsToInstall = <R>(args: DetermineSkillsToInstallArgs<R>) =>
  Effect.gen(function* () {
    const clack = yield* Clack;

    // Step 1: Discover skills
    const spinner = yield* clack.spinner();
    spinner.start("Discovering skills...");
    const { skills, resolvedSource } = yield* args.discover.pipe(
      Effect.tapError(() => Effect.sync(() => spinner.stop("Failed"))),
    );

    // Step 2: Non-empty validation
    if (!Array.isNonEmptyReadonlyArray(skills)) {
      spinner.stop("No skills found");
      return yield* new InstallError({
        message: formatError(
          "No skills found in source",
          [`Source: ${args.sourceLabel}`],
          "Verify the source path contains directories with SKILL.md files.",
        ),
        cause: Option.none(),
        retryable: false,
      });
    }

    spinner.stop(`Found ${skills.length} skill(s)`);

    // Step 3: List mode -> return all skills
    if (args.list) {
      yield* clack.log.info("Available skills:");
      yield* Effect.forEach(
        skills,
        (skill) => {
          const desc = Option.isSome(skill.description) ? ` - ${skill.description.value}` : "";
          return clack.log.message(`  ${skill.name}${desc}`);
        },
        { concurrency: 1 },
      );
      return {
        selectedSkills: Array.fromIterable(skills) as DiscoveredSkill[],
        resolvedSource,
        list: true as const,
      };
    }

    // Step 4: Selection logic

    // 4a. --skill specified -> validate all names exist
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

      return {
        selectedSkills: Array.filter(skills, (s) => args.requestedSkills.includes(s.name)),
        resolvedSource,
        list: false as const,
      };
    }

    // 4b. --all / --dry-run / --yes -> return all
    if (args.all || args.dryRun || args.yes) {
      if (args.all) yield* clack.log.info(`Installing all ${skills.length} skill(s)`);
      return {
        selectedSkills: Array.fromIterable(skills) as DiscoveredSkill[],
        resolvedSource,
        list: false as const,
      };
    }

    // 4c. Single skill -> auto-select
    if (skills.length === 1) {
      return {
        selectedSkills: Array.fromIterable(skills) as DiscoveredSkill[],
        resolvedSource,
        list: false as const,
      };
    }

    // 4d. Multiple skills -> multiselect prompt
    const selected = yield* confirmSkillsToInstall(skills);
    return {
      selectedSkills: selected,
      resolvedSource,
      list: false as const,
    };
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
          hint: s.description,
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
