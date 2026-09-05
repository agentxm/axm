import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../../app-error/index.js";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/extension-sources";
import { WorkspaceMutations, installedRowsByName } from "@agentxm/workspace-state";
import type { Plan, PlannedJobStep } from "@agentxm/workspace-operations";
import { previewOrApplyPlan, operationPresentation } from "@agentxm/workspace-operations";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import type { EnableSubagentOperation } from "@agentxm/extension-lifecycle";
import { enableSubagent } from "@agentxm/extension-lifecycle";
import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import { provideLifecycleFailureAdapter } from "../../../feature-errors.js";

export interface EnableSubagentHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

export const handleEnableSubagent = (args: EnableSubagentHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "subagents.enable",
      mode: args.preview ? "preview" : "apply",
      planName: "Enable subagent",
    },
    handleEnableSubagentBody(args),
  );

const handleEnableSubagentBody = Effect.fn("EnableSubagent.handle")(function* (
  args: EnableSubagentHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  const subagentName = yield* resolveInstalledIdentifierNameOrInput({
    input: args.name,
    resourceType: "subagent",
  });

  // Load installed subagents (configured + implicit) from the read-model record projection.
  const installedSubagents = yield* ws.records
    .rows("subagent")
    .pipe(Effect.map(installedRowsByName));
  const entry = installedSubagents[subagentName];

  // Validate: subagent is installed.
  if (entry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Subagent '${args.name}' is not installed`,
      suggestions: [
        {
          description: "Inspect installed subagents",
          cmd: "axm subagents list",
        },
      ],
    });
  }

  // Validate: subagent is currently disabled
  if (entry.enabled) {
    yield* emitNoOpOutcome("subagents.enable", {
      planName: "Enable subagent",
      planDescription: `Enable ${subagentName}`,
      message: `Subagent '${subagentName}' is already enabled`,
    });
    return;
  }

  // Build operation — operation handles both lock-backed and settings-only paths
  const op = {
    name: "enable-subagent",
    args: { subagentName },
  } satisfies EnableSubagentOperation;

  const step: PlannedJobStep = {
    readiness: "ready",
    label: subagentName,
    run: enableSubagent(op).pipe(
      provideLifecycleFailureAdapter,
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
    presentation: operationPresentation(
      { imperative: "enable", past: "Enabled", gerund: "Enabling" },
      "subagent",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["subagents", "enable"],
    [subagentName],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("subagents.enable", resolution, {
    suggestions: [
      { description: "Inspect installed subagents", cmd: "axm subagents list" },
      { description: "Undo", cmd: `axm subagents disable ${subagentName}` },
    ],
  });
});
