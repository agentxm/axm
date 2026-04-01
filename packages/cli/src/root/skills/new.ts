/**
 * Skills new handler — validates input, resolves profile and agents,
 * builds a single-step plan, and executes via `ws.resolvePlan()`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
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
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import { withRegistryRuntime, withWorkspace } from "../../runtime.js";

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

  // 5. Capture services for run closure
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  // 6. Build operation
  const op = {
    name: "new-skill",
    args: { name: args.name, profile, agents: [...agents] },
  } satisfies NewSkillOperation;

  // 7. Build plan with inline run closure
  const fqn = `${profile}/skills/${args.name}`;

  const toJobStepResult = (result: {
    readonly result: string;
    readonly message: string;
    readonly error?: import("@axm.sh/core/unstable/app-error").AppError;
  }): JobStepResult =>
    result.result === "error" && result.error != null
      ? { result: "error", message: result.message, error: result.error }
      : { result: "success", message: result.message };

  const step: PlannedJobStep = {
    readiness: "ready",
    label: fqn,
    run: newSkill(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "New skill",
    description: Option.some(`Create ${fqn}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  yield* resolvePlan(plan, {
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
  yes: yesFlag.pipe(Flag.withDescription("Create the skill without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Overwrite if a skill with this name already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, profile, agent, yes, force, preview }) =>
    handleSkillsNew({
      name,
      profile,
      agents: Option.map(agent, (value) => [...value]),
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRegistryRuntime({ command: "skills new" })),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new skill"),
  Command.withExamples([
    { command: "axm skills new my-skill", description: "Scaffold a new skill" },
    {
      command: "axm skills new my-skill --profile @acme",
      description: "Create under a specific profile",
    },
    { command: "", description: "See also: skills fork, skills publish" },
  ]),
);
