/**
 * Rename command handler - Effect-based orchestration for `axm skills rename`.
 *
 * Validates skill state then builds and resolves a single-step plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { RenameSkillOperation } from "../operations.js";
import type { Plan } from "../../../workspace/plan.js";
import { renameSkill } from "./rename-skill.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RenameHandlerArgs {
  /** Current name of the skill */
  readonly oldName: string;
  /** New name for the skill */
  readonly newName: string;
  /** Skip confirmations */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleRename = Effect.fn("Rename.handle")(function* (args: RenameHandlerArgs) {
    const ws = yield* Workspace;
    const log = yield* Log;

    yield* log.info("axm skills rename");

    // Load configured skills
    const configuredSkills = yield* ws.getConfiguredSkills();
    const entry = configuredSkills[args.oldName];

    // Validate: old name exists
    if (entry === undefined) {
      return yield* makeCliError({
        code: "SKILL_NOT_FOUND",
        what: `Skill '${args.oldName}' not found`,
        howToFix: "Run `axm skills list` to see available skills",
      });
    }

    // Validate: skill is managed
    if (!entry.managed) {
      return yield* makeCliError({
        code: "SKILL_NOT_MANAGED",
        what: `Cannot rename unmanaged skill '${args.oldName}'`,
        howToFix: "Only managed skills (installed via axm) can be renamed",
      });
    }

    // Validate: new name doesn't conflict
    if (configuredSkills[args.newName] !== undefined) {
      return yield* makeCliError({
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

    // Build single-step plan
    const plan: Plan<RenameSkillOperation> = {
      name: "Rename skill",
      description: Option.some(`Rename ${args.oldName} to ${args.newName}`),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: {
                result: "success",
                message: `Renamed ${args.oldName} to ${args.newName}`,
              },
              label: `${args.oldName} -> ${args.newName}`,
            },
          ],
        },
      ],
    };

    yield* ws.resolvePlan(plan, { "rename-skill": renameSkill });

    yield* log.success("Done");
  });
