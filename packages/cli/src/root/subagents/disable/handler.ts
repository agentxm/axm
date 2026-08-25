import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations, installedRowsByName } from "@agentxm/client-core/unstable/workspace";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { operationPresentation, previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import type { DisableSubagentOperation } from "@agentxm/client-core/unstable/subagents";
import { disableSubagent } from "@agentxm/client-core/unstable/subagents";
import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";

export interface DisableSubagentHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

export const handleDisableSubagent = (args: DisableSubagentHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "subagents.disable",
      mode: args.preview ? "preview" : "apply",
      planName: "Disable subagent",
    },
    handleDisableSubagentBody(args),
  );

const handleDisableSubagentBody = Effect.fn("DisableSubagent.handle")(function* (
  args: DisableSubagentHandlerArgs,
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
  const installedEntry = installedSubagents[subagentName];

  // Validate: subagent is installed.
  if (installedEntry === undefined) {
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

  // Configured subagent — check if already disabled (implicit subagents are always enabled)
  if (installedEntry.lifecycle === "configured" && !installedEntry.enabled) {
    yield* emitNoOpOutcome("subagents.disable", {
      planName: "Disable subagent",
      planDescription: `Disable ${subagentName}`,
      message: `Subagent '${subagentName}' is already disabled`,
    });
    return;
  }

  // Build operation — operation handles configured, settings-only, and implicit promotion
  const op = {
    name: "disable-subagent",
    args: { subagentName },
  } satisfies DisableSubagentOperation;

  const step: PlannedJobStep = {
    readiness: "ready",
    label: subagentName,
    run: disableSubagent(op).pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable subagent",
    description: Option.some(`Disable ${subagentName}`),
    presentation: operationPresentation(
      { imperative: "disable", past: "Disabled", gerund: "Disabling" },
      "subagent",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["subagents", "disable"],
    [subagentName],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("subagents.disable", resolution, {
    suggestions: [
      { description: "Inspect installed subagents", cmd: "axm subagents list" },
      { description: "Undo", cmd: `axm subagents enable ${subagentName}` },
    ],
  });
});
