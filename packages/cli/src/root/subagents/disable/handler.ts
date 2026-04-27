import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { Plan, PlannedJobStep, JobStepResult } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import type { DisableSubagentOperation } from "@agentxm/client-core/unstable/subagents";
import { disableSubagent } from "@agentxm/client-core/unstable/subagents";
import { emitNoOpResult, emitPlanResolutionResult } from "../../../json-output.js";

export interface DisableSubagentHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleDisableSubagent = Effect.fn("DisableSubagent.handle")(function* (
  args: DisableSubagentHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm subagents disable");

  // Load installed subagents (configured + implicit) from the read-model record projection.
  const installedSubagents = yield* ws.records.getInstalledSubagents();
  const installedEntry = installedSubagents[args.name];

  // Validate: subagent is installed (ignored names are excluded from installed)
  if (installedEntry === undefined) {
    return yield* makeAppError({
      code: "SUBAGENT_NOT_FOUND",
      what: `Subagent '${args.name}' is not installed`,
      howToFix: "Run `axm subagents list` to see available subagents",
    });
  }

  // Configured subagent — check if already disabled (implicit subagents are always enabled)
  if (installedEntry.lifecycle === "configured" && !installedEntry.enabled) {
    if (
      yield* emitNoOpResult("subagents.disable", {
        planName: "Disable subagent",
        planDescription: `Disable ${args.name}`,
        message: `Subagent '${args.name}' is already disabled`,
      })
    ) {
      return;
    }

    yield* renderer.info(`Subagent '${args.name}' is already disabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles configured, settings-only, and implicit promotion
  const op = {
    name: "disable-subagent",
    args: { subagentName: args.name },
  } satisfies DisableSubagentOperation;

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
    label: args.name,
    run: disableSubagent(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable subagent",
    description: Option.some(`Disable ${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("subagents.disable", resolution);

  yield* renderer.success("Done");
});
