/**
 * Skills new handler — validates input, resolves profile and agents,
 * builds a single-step plan, and executes via `ws.resolvePlan()`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import type { NewSkillOperation } from "@axm.sh/core/unstable/skills";
import { newSkill } from "@axm.sh/core/unstable/skills";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { buildSingleStepPlan } from "./plan-helpers.js";
import { bridgeLegacyPlan } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";

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
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
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
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm skills new");

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

  yield* resolvePlan(bridgeLegacyPlan(plan, { "new-skill": newSkill }), {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* renderer.success(`Created skill ${fqn}`);
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const newConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the skill (without profile)"),
  ),
  profile: Flag.string("profile").pipe(
    Flag.withDescription("Override the workspace profile (e.g., @acme)"),
    Flag.optional,
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Agent IDs to target (can be repeated)"),
    Flag.atLeast(1),
    Flag.optional,
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, profile, agent, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handleSkillsNew({
          name,
          profile,
          agents: Option.map(agent, (value) => [...value]),
          yes,
          force,
          preview,
        }),
      ),
      { command: "skills new" },
    ),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new skill"),
  Command.withExamples([
    { command: "axm skills new my-skill", description: "Create a new skill" },
    {
      command: "axm skills new my-skill --profile @acme",
      description: "Create with custom profile",
    },
  ]),
);
