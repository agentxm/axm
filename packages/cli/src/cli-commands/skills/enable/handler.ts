/**
 * Enable command handler - Effect-based orchestration for `axm skills enable`.
 *
 * Validates skill state using taxonomy lifecycle views then builds and resolves
 * a single-step plan. Enable only works for installed skills (configured or implicit).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { Output } from "@axm.sh/core/unstable/output";
import { Workspace } from "../../../workspace/index.js";
import type { EnableSkillOperation } from "../../../extensions/skills/operations/enable.js";
import { enableSkill } from "../../../extensions/skills/operations/enable.js";
import { buildSingleStepPlan } from "../plan-helpers.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EnableHandlerArgs {
  /** Name of the skill to enable */
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

export const handleEnable = Effect.fn("Enable.handle")(function* (args: EnableHandlerArgs) {
  const ws = yield* Workspace;
  const output = yield* Output;

  yield* output.info("axm skills enable");

  // Load installed skills (configured ∪ implicit) — taxonomy lifecycle view
  const installedSkills = yield* ws.getInstalledSkills();
  const entry = installedSkills[args.name];

  // Validate: skill is installed (ignored names are excluded from installed)
  if (entry === undefined) {
    return yield* makeAppError({
      code: "SKILL_NOT_FOUND",
      what: `Skill '${args.name}' is not installed`,
      howToFix: "Run `axm skills list` to see available skills",
    });
  }

  // Validate: skill is currently disabled
  if (entry.enabled) {
    yield* output.info(`Skill '${args.name}' is already enabled`);
    yield* output.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles both lock-backed and settings-only paths
  const op = {
    name: "enable-skill",
    args: { skillName: args.name },
  } satisfies EnableSkillOperation;

  // Build and resolve single-step plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "Enable skill",
    description: `Enable ${args.name}`,
    label: args.name,
  });

  yield* ws.resolvePlan(bridgeLegacyPlan(plan, { "enable-skill": enableSkill }), {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* output.success("Done");
});
