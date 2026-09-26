import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { collectCleanupStep, syncFailureRendering } from "@agentxm/workspace/reconciliation";
import { ConfigureAgents } from "@agentxm/workspace/configuration";
import { failureToAppError, toAppError } from "../../app-error/conversions.js";
import { acceptWarningsFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
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
    { command: "agents.remove", mode: args.preview ? "preview" : "apply", planName: PLAN_NAME },
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

  // The reconciliation feature plans the cleanup of the outputs only the
  // departing agents reached, against the membership the workspace holds
  // once they leave; the configuration feature applies it inside the
  // membership closure, so a cleanup that cannot complete leaves the agent
  // configured.
  const cleanup = yield* collectCleanupStep({
    expectedNames: candidate.reconciliation.expectedNames,
    desiredAgentIds: candidate.reconciliation.desiredAgentIds,
    adapter: syncFailureRendering,
  }).pipe(Effect.mapError(toAppError));

  const { execution, recovery } = yield* makePublicPositionalPlanInvocation(
    args,
    ["agents", "remove"],
    candidate.agentIds,
    args.force ? ["accept-warnings"] : [],
  );
  const resolution = yield* ConfigureAgents.remove
    .previewOrApply(candidate, execution, { steps: Option.toArray(cleanup) })
    .pipe(Effect.mapError(failureToAppError));

  yield* emitOperationResolution(resolution, {
    recovery,
    suggestions: [{ description: "Inspect configured agents", cmd: "axm agents list" }],
  });
});

const removeConfig = {
  ids: Argument.String("id").pipe(
    Argument.withDescription("Configured coding-agent IDs to remove"),
    Argument.atLeast(1),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Remove agents from project (default) or user-level configuration"),
  ),
  force: acceptWarningsFlag,
  preview: previewCapabilityFlag("Show what would change without applying"),
} as const;

export const removeCommand = Command.make(
  "remove",
  removeConfig,
  ({ ids, scope, force, preview }) =>
    handleAgentsRemove({ ids: [...ids], force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("agents remove"),
    ),
).pipe(
  withArgvTracking(removeConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Remove coding-agent harnesses and clean up AXM-managed artifacts"),
  Command.withExamples([
    { command: "axm agents remove cursor", description: "Remove Cursor from this workspace" },
    {
      command: "axm agents remove cursor --preview",
      description: "Preview managed artifact cleanup",
    },
  ]),
);
