/**
 * Disable command handler - Effect-based orchestration for `axm skills disable`.
 *
 * Validates skill state using taxonomy lifecycle views then builds and resolves
 * a single-step plan. The operation handles all paths: configured disable,
 * settings-only disable, and implicit-to-configured promotion.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "../../../workspace/index.js";
import type { DisableSkillOperation } from "../../../extensions/skills/operations/disable.js";
import { disableSkill } from "../../../extensions/skills/operations/disable.js";
import { buildSingleStepPlan } from "../plan-helpers.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DisableHandlerArgs {
  /** Name of the skill to disable */
  readonly name: string;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleDisable = Effect.fn("Disable.handle")(function* (args: DisableHandlerArgs) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm skills disable");

  // Load installed skills (configured ∪ implicit) — taxonomy lifecycle view
  const installedSkills = yield* ws.getInstalledSkills();
  const installedEntry = installedSkills[args.name];

  // Validate: skill is installed (ignored names are excluded from installed)
  if (installedEntry === undefined) {
    return yield* makeAppError({
      code: "SKILL_NOT_FOUND",
      what: `Skill '${args.name}' is not installed`,
      howToFix: "Run `axm skills list` to see available skills",
    });
  }

  // Configured skill — check if already disabled (implicit skills are always enabled)
  if (installedEntry.lifecycle === "configured" && !installedEntry.enabled) {
    yield* renderer.info(`Skill '${args.name}' is already disabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles configured, settings-only, and implicit promotion
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

  yield* ws.resolvePlan(bridgeLegacyPlan(plan, { "disable-skill": disableSkill }), {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* renderer.success("Done");
});
