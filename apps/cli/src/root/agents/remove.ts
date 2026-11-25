import { withParameterDescription } from "../../cli-parameters.js";
import { Argument, Command } from "effect/cli";
import * as Effect from "effect/Effect";
import { ConfigureAgents } from "@agentxm/workspace-features/configuration";
import { SyncWorkspace } from "@agentxm/workspace-features/sync";
import { failureToAppError, toAppError } from "../../app-error/conversions.js";
import { acceptWarningsFlag, discardModifiedFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withProjectionOutputPosture, withRuntime, withWorkspace } from "../../runtime.js";
import { emitNoOpOutcome, emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { makePublicPositionalPlanInvocation } from "../shared/confirmation-recovery.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

export interface AgentsRemoveArgs {
  readonly ids: ReadonlyArray<string>;
  readonly force: boolean;
  readonly preview: boolean;
}

const PLAN_NAME = "Remove coding agents";

export const handleAgentsRemove = (args: AgentsRemoveArgs) =>
  withOperationLifecycle(
    { mode: args.preview ? "preview" : "apply", planName: PLAN_NAME },
    handleAgentsRemoveBody(args),
  );

const handleAgentsRemoveBody = Effect.fn("Agents.remove")(function* (args: AgentsRemoveArgs) {
  const candidate = yield* ConfigureAgents.remove
    .prepare({ ids: args.ids })
    .pipe(Effect.mapError(failureToAppError));

  if (candidate._tag === "Unchanged") {
    yield* emitNoOpOutcome({
      planName: PLAN_NAME,
      planDescription: `Remove ${args.ids.join(", ")} and clean up managed artifacts`,
      message: candidate.message,
    });
    return;
  }

  const withdrawal = yield* SyncWorkspace.planAgentWithdrawal({
    expectedNames: candidate.reconciliation.expectedNames,
    desiredAgentIds: candidate.reconciliation.desiredAgentIds,
    configuredAgents: candidate.configuredAgents,
  }).pipe(Effect.mapError(toAppError));

  const { execution, recovery } = yield* makePublicPositionalPlanInvocation(
    args,
    candidate.agentIds,
    args.force ? ["accept-warnings"] : [],
  );
  const resolution = yield* ConfigureAgents.remove
    .previewOrApply(candidate, execution, { steps: withdrawal.steps })
    .pipe(Effect.mapError(failureToAppError));

  yield* emitOperationResolution(resolution, {
    recovery,
    suggestions: [
      {
        description: "Inspect configured agents",
        invocation: { command: ["agents", "list"], arguments: [] },
      },
    ],
  });
});

const removeConfig = {
  ids: Argument.String("id").pipe(
    withParameterDescription("Configured coding-agent IDs to remove"),
    Argument.atLeast(1),
  ),
  scope: scopeFlag,
  force: acceptWarningsFlag,
  preview: previewCapabilityFlag(),
  discardModified: discardModifiedFlag,
} as const;

export const removeCommand = Command.make(
  "remove",
  removeConfig,
  ({ ids, scope, force, preview, discardModified }) =>
    handleAgentsRemove({ ids: [...ids], force, preview }).pipe(
      withProjectionOutputPosture({ discardModified }),
      withWorkspace(scope),
      withRuntime(),
    ),
).pipe(
  withArgvTracking(removeConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription(
    "Remove coding-agent membership and owned files; retain native MCP and Hook registrations",
  ),
  Command.withExamples([
    { command: "axm agents remove cursor", description: "Remove Cursor from this workspace" },
    {
      command: "axm agents remove cursor --preview",
      description: "Preview membership, file cleanup, and retained native registrations",
    },
  ]),
);
