/**
 * Disable command handler - Effect-based orchestration for `axm skills disable`.
 *
 * Validates skill state then builds and resolves a single-step plan.
 * Supports both direct skills (settings entry) and transitive skills (via packs).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { pipe } from "effect/Function";
import { makeCliError } from "../../../cli-error/index.js";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { DisableSkillOperation } from "../../../extensions/skills/operations/disable.js";
import { buildSingleStepPlan } from "../plan-helpers.js";
import { disableSkill } from "../../../extensions/skills/operations/disable.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DisableHandlerArgs {
  /** Name of the skill to disable */
  readonly name: string;
  /** Skip confirmations */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleDisable = Effect.fn("Disable.handle")(function* (args: DisableHandlerArgs) {
  const ws = yield* Workspace;
  const log = yield* Log;

  yield* log.info("axm skills disable");

  // Load configured skills (direct settings entries)
  const configuredSkills = yield* ws.getConfiguredSkills();
  const entry = configuredSkills[args.name];

  // If not found in configured skills, check installed skills (includes transitive via packs)
  if (entry === undefined) {
    const installedSkills = yield* ws.getInstalledSkills();
    const installedEntry = installedSkills[args.name];

    if (installedEntry === undefined) {
      return yield* makeCliError({
        code: "SKILL_NOT_FOUND",
        what: `Skill '${args.name}' not found`,
        howToFix: "Run `axm skills list` to see available skills",
      });
    }

    // Transitive skill — promote to direct entry with enabled: false
    // Use the bare name (without scope) as the settings key
    const bareName = args.name.includes("/")
      ? pipe(
          args.name.split("/"),
          Array.last,
          Option.getOrElse(() => args.name),
        )
      : args.name;
    const source = Option.orElse(installedEntry.source, () => Option.some(args.name));
    yield* ws.setSkillEntry(bareName, { source, enabled: false, managed: true });

    yield* log.success("Done");
    return;
  }

  // Validate: skill is managed
  if (!entry.managed) {
    return yield* makeCliError({
      code: "SKILL_NOT_MANAGED",
      what: `Cannot disable unmanaged skill '${args.name}'`,
      howToFix: "Only managed skills (installed via axm) can be enabled/disabled",
    });
  }

  // Validate: skill is currently enabled
  if (!entry.enabled) {
    yield* log.info(`Skill '${args.name}' is already disabled`);
    yield* log.success("Nothing to do.");
    return;
  }

  // Build operation
  const op = {
    name: "disable-skill",
    args: { skillName: args.name },
  } satisfies DisableSkillOperation;

  // Build and resolve single-step plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "Disable skill",
    description: `Disable ${args.name}`,
    label: args.name,
    expectedMessage: `Disabled ${args.name}`,
  });

  yield* ws.resolvePlan(plan, { "disable-skill": disableSkill });

  yield* log.success("Done");
});
