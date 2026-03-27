/**
 * Rename command handler - Effect-based orchestration for `axm skills rename`.
 *
 * Validates skill state then builds and resolves a single-step plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { RenameSkillOperation } from "@axm.sh/core/unstable/extension-managers";
import { renameSkill } from "@axm.sh/core/unstable/extension-managers";
import { buildSingleStepPlan } from "../plan-helpers.js";
import { bridgeLegacyPlan } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RenameHandlerArgs {
  /** Current name of the skill */
  readonly oldName: string;
  /** New name for the skill */
  readonly newName: string;
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

export const handleRename = Effect.fn("Rename.handle")(function* (args: RenameHandlerArgs) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm skills rename");

  // Load configured skills
  const configuredSkills = yield* ws.getConfiguredSkills();
  const entry = configuredSkills[args.oldName];

  // Validate: old name exists
  if (entry === undefined) {
    return yield* makeAppError({
      code: "SKILL_NOT_FOUND",
      what: `Skill '${args.oldName}' not found`,
      howToFix: "Run `axm skills list` to see available skills",
    });
  }

  // Validate: new name doesn't conflict
  if (configuredSkills[args.newName] !== undefined) {
    return yield* makeAppError({
      code: "SKILL_NAME_CONFLICT",
      what: `Skill '${args.newName}' already exists`,
      howToFix: "Choose a different name or uninstall the existing skill first",
    });
  }

  // Build operation
  const op = {
    name: "rename-skill",
    args: { oldName: args.oldName, newName: args.newName },
  } satisfies RenameSkillOperation;

  // Build and resolve single-step plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "Rename skill",
    description: `Rename ${args.oldName} to ${args.newName}`,
    label: `${args.oldName} -> ${args.newName}`,
  });

  yield* resolvePlan(bridgeLegacyPlan(plan, { "rename-skill": renameSkill }), {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* renderer.success("Done");
});
