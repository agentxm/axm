import { Argument, Command, Flag } from "effect/unstable/cli";
import { NativeWriteAuthority } from "@agentxm/agent-integration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { CodingAgentRepository } from "@agentxm/workspace-projection";
import {
  reconcileAgentOutputs,
  type ReconcileAgentOutputsResult,
} from "@agentxm/workspace-reconciliation";
import {
  ConfigureAgents,
  type DepartingAgentReconciliation,
} from "@agentxm/workspace-configuration";
import { configurationFailureToAppError, syncFailureToAppError } from "../../feature-errors.js";
import { syncStepFailureAdapter } from "../../feature-errors.js";
import { acceptWarningsFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { count } from "../../screen/index.js";
import {
  type JobStepArtifactTarget,
  type JobStepResult,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import type { WorkspaceMutations } from "@agentxm/workspace-state";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

export interface AgentsRemoveArgs {
  readonly ids: ReadonlyArray<string>;
  readonly force: boolean;
  readonly preview: boolean;
}

const PLAN_NAME = "Remove coding agents";

const cleanupArtifact = (
  scope: "project" | "user",
  removedAgentIds: ReadonlyArray<string>,
  baseDir: string,
  path: Path.Path,
  result: ReconcileAgentOutputsResult,
) => ({
  path: "managed agent artifacts",
  scope,
  agents: [...removedAgentIds],
  change: result.removedPaths.length === 0 ? ("unchanged" as const) : ("removed" as const),
  fileCount: result.removedPaths.length,
  targets: [
    ...result.removedPaths.map((removedPath): JobStepArtifactTarget => ({
      path: path.relative(baseDir, removedPath),
      change: "removed",
    })),
    ...result.preservedPaths.map((preservedPath): JobStepArtifactTarget => ({
      path: path.relative(baseDir, preservedPath),
      change: "unchanged",
    })),
  ],
});

/**
 * The cleanup the reconciliation feature performs for the membership the
 * configuration feature settled. It is planned here and applied inside the
 * membership closure, so a cleanup that cannot complete leaves the agent
 * configured.
 */
const cleanupStep = (args: {
  readonly scope: "project" | "user";
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly agentIds: ReadonlyArray<string>;
  readonly reconciliation: DepartingAgentReconciliation;
  readonly preview: ReconcileAgentOutputsResult;
}): PlannedJobStep<
  | NativeWriteAuthority
  | WorkspaceMutations
  | CodingAgentRepository
  | FileSystem.FileSystem
  | Path.Path
> => ({
  label: "Remove managed agent artifacts",
  readiness: "ready",
  artifact: cleanupArtifact(args.scope, args.agentIds, args.baseDir, args.path, args.preview),
  run: reconcileAgentOutputs(args.reconciliation).pipe(
    Effect.mapError(syncStepFailureAdapter.toStepFailure),
    Effect.map(
      (result) =>
        ({
          result: "success",
          message: [
            `Removed ${count(result.removedPaths.length, "managed artifact")}`,
            ...(result.preservedPaths.length === 0
              ? []
              : [`preserved ${count(result.preservedPaths.length, "unowned artifact")}`]),
          ].join("; "),
          artifact: cleanupArtifact(args.scope, args.agentIds, args.baseDir, args.path, result),
        }) satisfies JobStepResult,
    ),
  ),
});

export const handleAgentsRemove = (args: AgentsRemoveArgs) =>
  withOperationLifecycle(
    { command: "agents.remove", mode: args.preview ? "preview" : "apply", planName: PLAN_NAME },
    handleAgentsRemoveBody(args),
  );

const handleAgentsRemoveBody = Effect.fn("Agents.remove")(function* (args: AgentsRemoveArgs) {
  const path = yield* Path.Path;
  const candidate = yield* ConfigureAgents.remove
    .prepare({ ids: args.ids })
    .pipe(Effect.mapError(configurationFailureToAppError));

  if (candidate._tag === "Unchanged") {
    yield* emitNoOpOutcome("agents.remove", {
      planName: PLAN_NAME,
      planDescription: `Remove ${args.ids.join(", ")} and clean up managed artifacts`,
      message: candidate.message,
    });
    return;
  }

  const cleanupPreview = yield* reconcileAgentOutputs({
    ...candidate.reconciliation,
    dryRun: true,
  }).pipe(Effect.mapError(syncFailureToAppError));

  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["agents", "remove"],
    candidate.agentIds,
    args.force ? ["accept-warnings"] : [],
  );
  const resolution = yield* ConfigureAgents.remove
    .previewOrApply(candidate, execution, {
      steps: [
        cleanupStep({
          scope: candidate.scope,
          baseDir: candidate.baseDir,
          path,
          agentIds: candidate.agentIds,
          reconciliation: candidate.reconciliation,
          preview: cleanupPreview,
        }),
      ],
    })
    .pipe(Effect.mapError(configurationFailureToAppError));

  yield* emitOperationResolution("agents.remove", resolution, {
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
