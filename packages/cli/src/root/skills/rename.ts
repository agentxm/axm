/**
 * Rename command handler - Effect-based orchestration for `axm skills rename`.
 *
 * Validates skill state then builds and resolves a single-step plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { RenameSkillOperation } from "@axm.sh/core/unstable/skills";
import { renameSkill } from "@axm.sh/core/unstable/skills";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../command-meta.js";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RenameHandlerArgs {
  /** Current name of the skill */
  readonly oldName: string;
  /** New name for the skill */
  readonly newName: string;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleRename = Effect.fn("Rename.handle")(function* (args: RenameHandlerArgs) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* renderer.info("axm skills rename");

  // Load configured skills
  const configuredSkills = yield* ws.getConfiguredSkills();
  const entry = configuredSkills[args.oldName];

  // Validate: old name exists
  if (entry === undefined) {
    return yield* makeAppError({
      code: "SKILL_NOT_FOUND",
      what: `Skill '${args.oldName}' not found`,
      howToFix: "Run `axm skills list` to see available skills",
    });
  }

  // Validate: new name doesn't conflict
  if (configuredSkills[args.newName] !== undefined) {
    return yield* makeAppError({
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

  // Build plan with inline run closure
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
    label: `${args.oldName} -> ${args.newName}`,
    run: renameSkill(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Rename skill",
    description: Option.some(`Rename ${args.oldName} to ${args.newName}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* resolvePlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("skills.rename", resolution);

  yield* renderer.success("Done");
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const renameConfig = {
  oldName: Argument.string("old-name").pipe(Argument.withDescription("Current name of the skill")),
  newName: Argument.string("new-name").pipe(Argument.withDescription("New name for the skill")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Rename in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Rename without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Rename even if the new name conflicts with an existing skill"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be renamed without making changes"),
  ),
} as const;
const commandMeta = registryCommandMeta("skills rename", { json: true });

export const renameCommand = Command.make(
  "rename",
  renameConfig,
  ({ oldName, newName, scope, yes, force, preview }) =>
    handleRename({ oldName, newName, yes, force, preview }).pipe(
      withWorkspace(scope),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(renameConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Rename a skill"),
  Command.withExamples([
    { command: "axm skills rename old-name new-name", description: "Give a skill a better name" },
    {
      command: "axm skills rename old-name new-name --preview",
      description: "Check what would change first",
    },
    { command: "", description: "See also: skills list, skills disable" },
  ]),
);
