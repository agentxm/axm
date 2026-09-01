import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/extension-management/unstable/source-resolution";
import { WorkspaceMutations, installedRowsByName } from "@agentxm/workspace-state";
import type { DisableSkillOperation } from "@agentxm/extension-management/unstable/skills";
import { disableSkill } from "@agentxm/extension-management/unstable/skills";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/workspace-operations";
import { previewOrApplyPlan, operationPresentation } from "@agentxm/workspace-operations";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { INSTALL_SKILL_FROM_REGISTRY, LIST_INSTALLED_SKILLS } from "../suggested-actions.js";

export interface DisableHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

export const handleDisable = (args: DisableHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "skills.disable",
      mode: args.preview ? "preview" : "apply",
      planName: "Disable skill",
    },
    handleDisableBody(args),
  );

const handleDisableBody = Effect.fn("Disable.handle")(function* (args: DisableHandlerArgs) {
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
    presentation: operationPresentation(
      { imperative: "disable", past: "Disabled", gerund: "Disabling" },
      "skill",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["skills", "disable"],
    [skillName],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("skills.disable", resolution, {
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
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, preview }) =>
    handleDisable({ name, yes, preview }).pipe(withWorkspace(scope), withRuntime("skills disable")),
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
