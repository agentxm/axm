import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations, installedRowsByName } from "@agentxm/client-core/unstable/workspace";
import type { DisableSkillOperation } from "@agentxm/client-core/unstable/skills";
import { disableSkill } from "@agentxm/client-core/unstable/skills";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { INSTALL_SKILL_FROM_REGISTRY, LIST_INSTALLED_SKILLS } from "../suggested-actions.js";

export interface DisableHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleDisable = Effect.fn("Disable.handle")(function* (args: DisableHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const skillName = yield* resolveInstalledIdentifierNameOrInput({
    input: args.name,
    resourceType: "skill",
  });

  // Load installed skills (configured + implicit) from the read-model record projection.
  const installedSkills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));
  const installedEntry = installedSkills[skillName];

  // Validate: skill is installed.
  if (installedEntry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Skill '${args.name}' is not installed`,
      suggestions: [LIST_INSTALLED_SKILLS, INSTALL_SKILL_FROM_REGISTRY],
    });
  }

  // Configured skill: check if already disabled (implicit skills are always enabled).
  if (installedEntry.lifecycle === "configured" && !installedEntry.enabled) {
    yield* emitNoOpOutcome("skills.disable", {
      planName: "Disable skill",
      planDescription: `Disable ${skillName}`,
      message: `Skill '${skillName}' is already disabled`,
    });
    return;
  }

  // Build operation — operation handles configured, settings-only, and implicit promotion
  const op = {
    name: "disable-skill",
    args: { skillName },
  } satisfies DisableSkillOperation;

  // Build plan with inline run closure
  const step: PlannedJobStep = {
    readiness: "ready",
    label: skillName,
    run: disableSkill(op).pipe(
      Effect.map((result): JobStepResult => result),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable skill",
    description: Option.some(`Disable ${skillName}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
    displayApplied: false,
  });
  yield* emitAppliedPlanOutcome({
    command: "skills.disable",
    headline: `Disabled skill ${skillName}`,
    resolution,
    suggestions: [
      LIST_INSTALLED_SKILLS,
      { description: "Undo", cmd: `axm skills enable ${skillName}` },
    ],
  });
});

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Disable even if other skills depend on it")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleDisable({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("skills disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable a skill without uninstalling it"),
  Command.withExamples([
    {
      command: "axm skills disable code-review",
      description: "Temporarily disable a skill without removing it",
    },
    {
      command: "axm skills disable code-review --scope user",
      description: "Disable for user-scope configuration",
    },
  ]),
);
