/**
 * Skill selection logic for the install command.
 *
 * Extracts the priority-ordered selection flow from the handler into a
 * dedicated function that returns a filtered list of `DiscoveredSkill`s.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { DiscoveredSkill } from "../../../extensions/skills/index.js";
import type { Source } from "../../../sources/index.js";
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
  readonly skills: Array.NonEmptyReadonlyArray<DiscoveredSkill>;
  readonly source: Source;
  readonly requestedSkills: readonly string[];
  readonly all: boolean;
  readonly dryRun: boolean;
  readonly canPrompt: boolean;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Selects which skills to install based on flags and source context.
 *
 * Priority order:
 * 1. `--skill` specified -> validate ALL exist, error if any miss, return matches
 * 2. `--all` / `--dry-run` -> return all
 * 3. Registry source, single skill not from pack (`discoveryPath.length === 1`) -> auto-select
 * 4. Registry source, from pack -> confirm (single) or multiselect (multiple)
 * 5. Non-registry, single skill -> auto-select
 * 6. Non-registry, multiple skills, can't prompt -> error
 * 7. Non-registry, multiple skills, can prompt -> multiselect
 */
export const selectSkills = (args: SelectSkillsArgs) =>
  Effect.gen(function* () {
    const clack = yield* Clack;

    // 1. --skill specified -> validate all names exist
    if (args.requestedSkills.length > 0) {
      const invalidSkills = Array.filter(
        args.requestedSkills,
        (name) => !args.skills.some((s) => s.name === name),
      );

      if (invalidSkills.length > 0) {
        return yield* new InstallError({
          message: formatError(
            `Unknown skill(s): ${invalidSkills.join(", ")}`,
            [`Available: ${args.skills.map((s) => s.name).join(", ")}`],
            "Check the skill names and try again.",
          ),
          cause: Option.none(),
          retryable: false,
        });
      }

      return Array.filter(args.skills, (s) => args.requestedSkills.includes(s.name));
    }

    // 2. --all / --dry-run -> return all
    if (args.all || args.dryRun) {
      if (args.all) yield* clack.log.info(`Installing all ${args.skills.length} skill(s)`);
      return Array.fromIterable(args.skills);
    }

    // 3. Registry source, single skill not from pack -> auto-select
    if (args.source.source === "registry") {
      const singleNonPack = Array.filter(args.skills, (s) => s.discoveryPath.length === 1);
      if (singleNonPack.length === 1) {
        return singleNonPack;
      }

      // 4. Registry source, from pack -> confirm (single) or multiselect (multiple)
      if (args.skills.length === 1) {
        const skill = Array.headNonEmpty(args.skills);
        const confirmed = yield* clack.confirm(`Install ${skill.name}?`).pipe(
          Effect.mapError(
            (error) =>
              new InstallError(
                error._tag === "PromptCancelled"
                  ? { message: "Operation cancelled.", cause: Option.none(), retryable: false }
                  : {
                      message: "Failed to prompt for confirmation",
                      cause: Option.some(error),
                      retryable: false,
                    },
              ),
          ),
        );
        return confirmed ? [skill] : [];
      }

      // Multiple skills from registry pack -> multiselect
      return yield* promptMultiselect(clack, args.skills);
    }

    // 5. Non-registry, single skill -> auto-select
    if (args.skills.length === 1) {
      return Array.fromIterable(args.skills);
    }

    // 6. Non-registry, multiple skills, can't prompt -> error
    if (!args.canPrompt) {
      return yield* new InstallError({
        message: formatError(
          "Cannot prompt for skill selection",
          ["stdin is not a TTY"],
          "Use --yes, --all, or --non-interactive to run without prompts.",
        ),
        cause: Option.none(),
        retryable: false,
      });
    }

    // 7. Non-registry, multiple skills, can prompt -> multiselect
    return yield* promptMultiselect(clack, args.skills);
  });

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

const promptMultiselect = (
  clack: Clack["Type"],
  skills: Array.NonEmptyReadonlyArray<DiscoveredSkill>,
) =>
  clack
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
