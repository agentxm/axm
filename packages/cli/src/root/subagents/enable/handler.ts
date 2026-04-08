/**
 * Enable command handler - Effect-based orchestration for `axm subagents enable`.
 *
 * Validates subagent state using taxonomy lifecycle views then builds and resolves
 * a single-step plan. Enable only works for installed subagents (configured or implicit).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { Plan, PlannedJobStep, JobStepResult } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import { CodingAgentRepository } from "@axm.sh/core/unstable/agents";
import type { EnableSubagentOperation } from "@axm.sh/core/unstable/subagents";
import { enableSubagent } from "@axm.sh/core/unstable/subagents";
import { emitNoOpResult, emitPlanResolutionResult } from "../../../json-output.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EnableSubagentHandlerArgs {
  /** Name of the subagent to enable */
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

export const handleEnableSubagent = Effect.fn("EnableSubagent.handle")(function* (
  args: EnableSubagentHandlerArgs,
) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm subagents enable");

  // Load installed subagents (configured + implicit) — taxonomy lifecycle view
  const installedSubagents = yield* ws.getInstalledSubagents();
  const entry = installedSubagents[args.name];

  // Validate: subagent is installed (ignored names are excluded from installed)
  if (entry === undefined) {
    return yield* makeAppError({
      code: "SUBAGENT_NOT_FOUND",
      what: `Subagent '${args.name}' is not installed`,
      howToFix: "Run `axm subagents list` to see available subagents",
    });
  }

  // Validate: subagent is currently disabled
  if (entry.enabled) {
    if (
      yield* emitNoOpResult("subagents.enable", {
        planName: "Enable subagent",
        planDescription: `Enable ${args.name}`,
        message: `Subagent '${args.name}' is already enabled`,
      })
    ) {
      return;
    }

    yield* renderer.info(`Subagent '${args.name}' is already enabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles both lock-backed and settings-only paths
  const op = {
    name: "enable-subagent",
    args: { subagentName: args.name },
  } satisfies EnableSubagentOperation;

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
    run: enableSubagent(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Enable subagent",
    description: Option.some(`Enable ${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* resolvePlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("subagents.enable", resolution);

  yield* renderer.success("Done");
});
