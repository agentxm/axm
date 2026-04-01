/**
 * Disable command handler - Effect-based orchestration for `axm skills disable`.
 *
 * Validates skill state using taxonomy lifecycle views then builds and resolves
 * a single-step plan. The operation handles all paths: configured disable,
 * settings-only disable, and implicit-to-configured promotion.
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
import type { DisableSkillOperation } from "@axm.sh/core/unstable/skills";
import { disableSkill } from "@axm.sh/core/unstable/skills";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../command-meta.js";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DisableHandlerArgs {
  /** Name of the skill to disable */
  readonly name: string;
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

export const handleDisable = Effect.fn("Disable.handle")(function* (args: DisableHandlerArgs) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* renderer.info("axm skills disable");

  // Load installed skills (configured ∪ implicit) — taxonomy lifecycle view
  const installedSkills = yield* ws.getInstalledSkills();
  const installedEntry = installedSkills[args.name];

  // Validate: skill is installed (ignored names are excluded from installed)
  if (installedEntry === undefined) {
    return yield* makeAppError({
      code: "SKILL_NOT_FOUND",
      what: `Skill '${args.name}' is not installed`,
      howToFix: "Run `axm skills list` to see available skills",
    });
  }

  // Configured skill — check if already disabled (implicit skills are always enabled)
  if (installedEntry.lifecycle === "configured" && !installedEntry.enabled) {
    if (
      yield* emitNoOpResult("skills.disable", {
        planName: "Disable skill",
        planDescription: `Disable ${args.name}`,
        message: `Skill '${args.name}' is already disabled`,
      })
    ) {
      return;
    }

    yield* renderer.info(`Skill '${args.name}' is already disabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles configured, settings-only, and implicit promotion
  const op = {
    name: "disable-skill",
    args: { skillName: args.name },
  } satisfies DisableSkillOperation;

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
    label: args.name,
    run: disableSkill(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable skill",
    description: Option.some(`Disable ${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* resolvePlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("skills.disable", resolution);

  yield* renderer.success("Done");
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Disable even if other skills depend on it")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;
const commandMeta = registryCommandMeta("skills disable", { json: true });

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleDisable({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(disableConfig),
  annotateCommandMeta(commandMeta),
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
    { command: "", description: "See also: skills enable, skills uninstall" },
  ]),
);
