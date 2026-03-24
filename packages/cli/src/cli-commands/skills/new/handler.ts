/**
 * Skills new handler — validates input, resolves profile and agents,
 * builds a single-step plan, and executes via `ws.resolvePlan()`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../../app-error/index.js";
import { TelemetryClient } from "../../../telemetry/index.js";
import type { NewSkillOperation } from "../../../extensions/skills/operations/new-skill.js";
import { newSkill } from "../../../extensions/skills/operations/new-skill.js";
import { Output } from "../../../output/index.js";
import { Workspace } from "../../../workspace/index.js";
import { buildSingleStepPlan } from "../plan-helpers.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SkillsNewHandlerArgs {
  readonly name: string;
  readonly profile: Option.Option<string>;
  readonly agents: Option.Option<readonly string[]>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const normalizeProfile = (s: string) => (s.startsWith("@") ? s : `@${s}`);

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleSkillsNew = Effect.fn("SkillsNew.handle")(function* (
  args: SkillsNewHandlerArgs,
) {
  const tc = yield* TelemetryClient;
  yield* tc.trackEvent("command_invoked", { command: "skills new" });
  const ws = yield* Workspace;
  const output = yield* Output;

  yield* output.info("axm skills new");

  // 1. Resolve profile
  const profile = Option.isSome(args.profile)
    ? normalizeProfile(args.profile.value)
    : yield* ws.getConfiguredProfile().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeAppError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No profile configured for skill creation",
                  howToFix:
                    "Configure a profile in settings.json with `axm init`, or use --profile",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "SKILL_NAME_INVALID",
      what: `Invalid skill name: "${args.name}"`,
      details: [
        "Skill names must be lowercase, start with a letter or digit,",
        "contain only letters, digits, and hyphens, and not exceed 64 characters.",
      ],
      howToFix: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
    });
  }

  // 3. Check existence
  const configuredSkills = yield* ws.getConfiguredSkills();
  if (args.name in configuredSkills) {
    return yield* makeAppError({
      code: "SKILL_ALREADY_EXISTS",
      what: `Skill '${args.name}' already exists in settings`,
      howToFix: "Choose a different name or remove the existing skill first",
    });
  }

  // 4. Resolve agents
  const agents = Option.isSome(args.agents) ? args.agents.value : yield* ws.getConfiguredAgents();

  // 5. Build operation
  const op = {
    name: "new-skill",
    args: { name: args.name, profile, agents: [...agents] },
  } satisfies NewSkillOperation;

  // 6. Build and resolve single-step plan
  const fqn = `${profile}/skills/${args.name}`;
  const plan = buildSingleStepPlan({
    operation: op,
    name: "New skill",
    description: `Create ${fqn}`,
    label: fqn,
  });

  yield* ws.resolvePlan(bridgeLegacyPlan(plan, { "new-skill": newSkill }));

  yield* output.success(`Created skill ${fqn}`);
});
