import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { EnableSkillOperation } from "@agentxm/client-core/unstable/skills";
import { enableSkill } from "@agentxm/client-core/unstable/skills";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";

export interface EnableHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleEnable = Effect.fn("Enable.handle")(function* (args: EnableHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* renderer.info("axm skills enable");

  const skillName = yield* resolveInstalledIdentifierNameOrInput({
    input: args.name,
    resourceType: "skill",
  });

  // Load installed skills (configured + implicit) from the read-model record projection.
  const installedSkills = yield* ws.records.getInstalledSkills();
  const entry = installedSkills[skillName];

  // Validate: skill is installed (ignored names are excluded from installed)
  if (entry === undefined) {
    return yield* makeAppError({
      code: "SKILL_NOT_FOUND",
      category: "not_found",
      message: `Skill '${args.name}' is not installed`,
      breadcrumbs: [
        { task: "Recover", description: "Run `axm skills list` to see available skills" },
      ],
    });
  }

  // Validate: skill is currently disabled
  if (entry.enabled) {
    if (
      yield* emitNoOpResult("skills.enable", {
        planName: "Enable skill",
        planDescription: `Enable ${skillName}`,
        message: `Skill '${skillName}' is already enabled`,
      })
    ) {
      return;
    }

    yield* renderer.info(`Skill '${skillName}' is already enabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles both lock-backed and settings-only paths
  const op = {
    name: "enable-skill",
    args: { skillName },
  } satisfies EnableSkillOperation;

  // Build plan with inline run closure
  const toJobStepResult = (result: {
    readonly result: string;
    readonly message: string;
    readonly error?: import("@agentxm/client-core/unstable/app-error").AppError;
  }): JobStepResult =>
    result.result === "error" && result.error != null
      ? { result: "error", message: result.message, error: result.error }
      : { result: "success", message: result.message };

  const step: PlannedJobStep = {
    readiness: "ready",
    label: skillName,
    run: enableSkill(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Enable skill",
    description: Option.some(`Enable ${skillName}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("skills.enable", resolution);

  yield* renderer.success("Done");
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Enable even if the skill has unresolved dependencies"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleEnable({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("skills enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a previously disabled skill"),
  Command.withExamples([
    {
      command: "axm skills enable code-review",
      description: "Re-enable a skill you previously disabled",
    },
    {
      command: "axm skills enable code-review --preview",
      description: "Preview the change before enabling",
    },
  ]),
);
