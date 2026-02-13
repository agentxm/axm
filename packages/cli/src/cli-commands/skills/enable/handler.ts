/**
 * Enable command handler - Effect-based orchestration for `axm skills enable`.
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
import type { EnableSkillOperation } from "../operations.js";
import type { Plan } from "../../../workspace/plan.js";
import { enableSkill } from "./enable-skill.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EnableHandlerArgs {
  /** Name of the skill to enable */
  readonly name: string;
  /** Skip confirmations */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleEnable = (args: EnableHandlerArgs) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const log = yield* Log;

    yield* log.info("axm skills enable");

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
        what: `Cannot enable unmanaged skill '${args.name}'`,
        howToFix: "Only managed skills (installed via axm) can be enabled/disabled",
      });
    }

    // Validate: skill is currently disabled
    if (entry.enabled) {
      yield* log.info(`Skill '${args.name}' is already enabled`);
      yield* log.success("Nothing to do.");
      return;
    }

    // Build operation
    const op = {
      name: "enable-skill",
      args: { skillName: args.name },
    } satisfies EnableSkillOperation;

    // Build single-step plan
    const plan: Plan<EnableSkillOperation> = {
      name: "Enable skill",
      description: Option.some(`Enable ${args.name}`),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              _tag: "PlannedJobStep",
              operation: op,
              expectedResult: { result: "success", message: `Enabled ${args.name}` },
              label: args.name,
            },
          ],
        },
      ],
    };

    yield* ws.resolvePlan(plan, { "enable-skill": enableSkill });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("Enable.handle"));
