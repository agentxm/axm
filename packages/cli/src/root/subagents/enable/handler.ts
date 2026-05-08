import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { Plan, PlannedJobStep, JobStepResult } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import type { EnableSubagentOperation } from "@agentxm/client-core/unstable/subagents";
import { enableSubagent } from "@agentxm/client-core/unstable/subagents";
import { emitNoOpResult, emitPlanResolutionResult } from "../../../json-output.js";

export interface EnableSubagentHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleEnableSubagent = Effect.fn("EnableSubagent.handle")(function* (
  args: EnableSubagentHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm subagents enable");

  const subagentName = yield* resolveInstalledIdentifierNameOrInput({
    input: args.name,
    resourceType: "subagent",
  });

  // Load installed subagents (configured + implicit) from the read-model record projection.
  const installedSubagents = yield* ws.records.getInstalledSubagents();
  const entry = installedSubagents[subagentName];

  // Validate: subagent is installed (ignored names are excluded from installed)
  if (entry === undefined) {
    return yield* makeAppError({
      code: "SUBAGENT_NOT_FOUND",
      category: "not_found",
      what: `Subagent '${args.name}' is not installed`,
      breadcrumbs: [
        { task: "Recover", description: "Run `axm subagents list` to see available subagents" },
      ],
    });
  }

  // Validate: subagent is currently disabled
  if (entry.enabled) {
    if (
      yield* emitNoOpResult("subagents.enable", {
        planName: "Enable subagent",
        planDescription: `Enable ${subagentName}`,
        message: `Subagent '${subagentName}' is already enabled`,
      })
    ) {
      return;
    }

    yield* renderer.info(`Subagent '${subagentName}' is already enabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles both lock-backed and settings-only paths
  const op = {
    name: "enable-subagent",
    args: { subagentName },
  } satisfies EnableSubagentOperation;

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
    label: subagentName,
    run: enableSubagent(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Enable subagent",
    description: Option.some(`Enable ${subagentName}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("subagents.enable", resolution);

  yield* renderer.success("Done");
});
