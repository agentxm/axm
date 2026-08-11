import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations, installedRowsByName } from "@agentxm/client-core/unstable/workspace";
import type { EnableSkillOperation } from "@agentxm/client-core/unstable/skills";
import { enableSkill } from "@agentxm/client-core/unstable/skills";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { INSTALL_SKILL_FROM_REGISTRY, LIST_INSTALLED_SKILLS } from "../suggested-actions.js";

export interface EnableHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

export const handleEnable = Effect.fn("Enable.handle")(function* (args: EnableHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const skillName = yield* resolveInstalledIdentifierNameOrInput({
    input: args.name,
    resourceType: "skill",
  });

  // Load installed skills (configured + implicit) from the read-model record projection.
  const installedSkills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));
  const entry = installedSkills[skillName];

  // Validate: skill is installed.
  if (entry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Skill '${args.name}' is not installed`,
      suggestions: [LIST_INSTALLED_SKILLS, INSTALL_SKILL_FROM_REGISTRY],
    });
  }

  // Validate: skill is currently disabled
  if (entry.enabled) {
    yield* emitNoOpOutcome("skills.enable", {
      planName: "Enable skill",
      planDescription: `Enable ${skillName}`,
      message: `Skill '${skillName}' is already enabled`,
    });
    return;
  }

  // Build operation — operation handles both lock-backed and settings-only paths
  const op = {
    name: "enable-skill",
    args: { skillName },
  } satisfies EnableSkillOperation;

  // Build plan with inline run closure
  const step: PlannedJobStep = {
    readiness: "ready",
    label: skillName,
    run: enableSkill(op).pipe(
      Effect.map((result): JobStepResult => result),
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

  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["skills", "enable"],
    [skillName],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution, displayApplied: false });
  yield* emitAppliedPlanOutcome({
    command: "skills.enable",
    headline: `Enabled skill ${skillName}`,
    resolution,
    suggestions: [
      LIST_INSTALLED_SKILLS,
      { description: "Undo", cmd: `axm skills disable ${skillName}` },
    ],
  });
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make("enable", enableConfig, ({ name, scope, yes, preview }) =>
  handleEnable({ name, yes, preview }).pipe(withWorkspace(scope), withRuntime("skills enable")),
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
