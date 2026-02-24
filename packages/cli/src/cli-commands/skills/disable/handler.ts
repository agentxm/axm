/**
 * Disable command handler - Effect-based orchestration for `axm skills disable`.
 *
 * Validates skill state using taxonomy lifecycle views then builds and resolves
 * a single-step plan. Supports both configured skills and implicit skills
 * (promoted to configured entry with `enabled: false`).
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

  // Load installed skills (configured ∪ implicit) — taxonomy lifecycle view
  const installedSkills = yield* ws.getInstalledSkills();
  const installedEntry = installedSkills[args.name];

  // Validate: skill is installed (ignored names are excluded from installed)
  if (installedEntry === undefined) {
    return yield* makeCliError({
      code: "SKILL_NOT_FOUND",
      what: `Skill '${args.name}' is not installed`,
      howToFix: "Run `axm skills list` to see available skills",
    });
  }

  // If implicit (not configured), promote to configured entry with enabled: false
  if (installedEntry.lifecycle === "implicit") {
    const bareName = args.name.includes("/")
      ? pipe(
          args.name.split("/"),
          Array.last,
          Option.getOrElse(() => args.name),
        )
      : args.name;
    const source = Option.getOrElse(installedEntry.source, () => args.name);
    yield* ws.setSkillEntry(bareName, { source, enabled: false });

    yield* log.success("Done");
    return;
  }

  // Configured skill — check if already disabled
  if (!installedEntry.enabled) {
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
  });

  yield* ws.resolvePlan(plan, { "disable-skill": disableSkill });

  yield* log.success("Done");
});
