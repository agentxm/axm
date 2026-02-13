/**
 * Disable command handler - Effect-based orchestration for `axm skills disable`.
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
import type { DisableSkillOperation } from "../operations.js";
import type { Plan } from "../../../workspace/plan.js";
import { disableSkill } from "./disable-skill.js";

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

export const handleDisable = (args: DisableHandlerArgs) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const log = yield* Log;

    yield* log.info("axm skills disable");

    // Load configured skills
    const configuredSkills = yield* ws.getConfiguredSkills();
    const entry = configuredSkills[args.name];

    // Validate: skill exists
    if (entry === undefined) {
      return yield* makeCliError({
        code: "SKILL_NOT_FOUND",
        what: `Skill '${args.name}' not found`,
        howToFix: "Run `axm skills list` to see available skills",
      });
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

    // Build single-step plan
    const plan: Plan<DisableSkillOperation> = {
      name: "Disable skill",
      description: Option.some(`Disable ${args.name}`),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: { result: "success", message: `Disabled ${args.name}` },
              label: args.name,
            },
          ],
        },
      ],
    };

    yield* ws.resolvePlan(plan, { "disable-skill": disableSkill });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("Disable.handle"));
