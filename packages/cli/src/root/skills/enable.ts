/**
 * Enable command handler - Effect-based orchestration for `axm skills enable`.
 *
 * Validates skill state using taxonomy lifecycle views then builds and resolves
 * a single-step plan. Enable only works for installed skills (configured or implicit).
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
import type { EnableSkillOperation } from "@axm.sh/core/unstable/skills";
import { enableSkill } from "@axm.sh/core/unstable/skills";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import { withRegistryRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EnableHandlerArgs {
  /** Name of the skill to enable */
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

export const handleEnable = Effect.fn("Enable.handle")(function* (args: EnableHandlerArgs) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* renderer.info("axm skills enable");

  // Load installed skills (configured ∪ implicit) — taxonomy lifecycle view
  const installedSkills = yield* ws.getInstalledSkills();
  const entry = installedSkills[args.name];

  // Validate: skill is installed (ignored names are excluded from installed)
  if (entry === undefined) {
    return yield* makeAppError({
      code: "SKILL_NOT_FOUND",
      what: `Skill '${args.name}' is not installed`,
      howToFix: "Run `axm skills list` to see available skills",
    });
  }

  // Validate: skill is currently disabled
  if (entry.enabled) {
    yield* renderer.info(`Skill '${args.name}' is already enabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles both lock-backed and settings-only paths
  const op = {
    name: "enable-skill",
    args: { skillName: args.name },
  } satisfies EnableSkillOperation;

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
    run: enableSkill(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Enable skill",
    description: Option.some(`Enable ${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  yield* resolvePlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* renderer.success("Done");
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

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
      withRegistryRuntime({ command: "skills enable" }),
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
    { command: "", description: "See also: skills disable, skills list" },
  ]),
);
