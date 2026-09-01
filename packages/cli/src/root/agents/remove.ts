import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/extension-management/unstable/extension-workspace";
import {
  cleanupManagedArtifactsForRemovedAgents,
  type RemovedAgentArtifactCleanupResult,
} from "@agentxm/extension-management/unstable/workspace-sync";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  acceptWarningsFlag,
  previewFlag,
  yesFlag,
} from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { count } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  previewOrApplyPlan,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { makeAtomicMembershipSteps } from "./atomic-membership.js";
import { validateAgentIds } from "./shared.js";
import {
  failureToStepFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";

export interface AgentsRemoveArgs {
  readonly ids: ReadonlyArray<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

interface CleanupServices {
  readonly ws: WorkspaceMutationsService;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly agentRepo: CodingAgentRepositoryService;
}

const provideCleanupServices = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    WorkspaceMutations | FileSystem.FileSystem | Path.Path | CodingAgentRepository
  >,
  services: CleanupServices,
) =>
  effect.pipe(
    Effect.provideService(WorkspaceMutations, services.ws),
    Effect.provideService(FileSystem.FileSystem, services.fs),
    Effect.provideService(Path.Path, services.path),
    Effect.provideService(CodingAgentRepository, services.agentRepo),
  );

const cleanupStep = (
  removedAgentIds: ReadonlySet<string>,
  services: CleanupServices,
  preview: RemovedAgentArtifactCleanupResult,
): PlannedJobStep => ({
  label: "Remove managed agent artifacts",
  readiness: "ready",
  artifact: {
    path: "managed agent artifacts",
    scope: services.ws.scope,
    agents: [...removedAgentIds],
    change: preview.removedPaths.length === 0 ? "unchanged" : "removed",
    fileCount: preview.removedPaths.length,
    targets: [
      ...preview.removedPaths.map((removedPath): JobStepArtifactTarget => ({
        path: services.path.relative(services.ws.baseDir, removedPath),
        change: "removed",
      })),
      ...preview.preservedPaths.map((preservedPath): JobStepArtifactTarget => ({
        path: services.path.relative(services.ws.baseDir, preservedPath),
        change: "unchanged",
      })),
    ],
  },
  run: provideCleanupServices(
    cleanupManagedArtifactsForRemovedAgents({ removedAgentIds }).pipe(
      Effect.mapError(failureToStepFailure),
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
            artifact: {
              path: "managed agent artifacts",
              scope: services.ws.scope,
              agents: [...removedAgentIds],
              change: result.removedPaths.length === 0 ? "unchanged" : "removed",
              fileCount: result.removedPaths.length,
              targets: [
                ...result.removedPaths.map((removedPath): JobStepArtifactTarget => ({
                  path: services.path.relative(services.ws.baseDir, removedPath),
                  change: "removed",
                })),
                ...result.preservedPaths.map((preservedPath): JobStepArtifactTarget => ({
                  path: services.path.relative(services.ws.baseDir, preservedPath),
                  change: "unchanged",
                })),
              ],
            },
          }) satisfies JobStepResult,
      ),
    ),
    services,
  ),
});

const removeAgentStep = (ws: WorkspaceMutationsService, agentId: string): PlannedJobStep => ({
  label: `Remove ${agentId}`,
  readiness: "ready",
  artifact: {
    path: workspaceSettingsPath(ws.scope),
    scope: ws.scope,
    agents: [agentId],
    change: "updated",
    fileCount: 1,
    targets: [{ path: workspaceSettingsPath(ws.scope), change: "updated", agentIds: [agentId] }],
  },
  run: ws
    .removeConfiguredAgent(agentId)
    .pipe(Effect.mapError(toAppError))
    .pipe(
      Effect.mapError(failureToStepFailure),
      Effect.as({
        result: "success",
        message: `Removed ${agentId}`,
        artifact: {
          path: workspaceSettingsPath(ws.scope),
          scope: ws.scope,
          agents: [agentId],
          change: "updated",
          fileCount: 1,
          targets: [
            { path: workspaceSettingsPath(ws.scope), change: "updated", agentIds: [agentId] },
          ],
        },
      } satisfies JobStepResult),
    ),
});

const makePlan = <Requirements, Output>(
  agentIds: ReadonlyArray<string>,
  steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>,
): Plan<Requirements, Output> => ({
  _tag: "Plan",
  name: "Remove coding agents",
  description: Option.some(`Remove ${agentIds.join(", ")} and clean up managed artifacts`),
  presentation: {
    verb: { imperative: "remove", past: "Removed", gerund: "Removing" },
    subject: { singular: "agent", plural: "agents" },
  },
  jobs: [{ concurrency: 1, executionPolicy: "best-effort", steps }],
});

export const handleAgentsRemove = (args: AgentsRemoveArgs) =>
  withOperationLifecycle(
    {
      command: "agents.remove",
      mode: args.preview ? "preview" : "apply",
      planName: "Remove coding agents",
    },
    handleAgentsRemoveBody(args),
  );

const handleAgentsRemoveBody = Effect.fn("Agents.remove")(function* (args: AgentsRemoveArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  const agentIds = yield* validateAgentIds(args.ids);
  const configured = yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError));
  const configuredSet = new Set(configured);
  const missing = agentIds.filter((id) => !configuredSet.has(id));

  if (missing.length > 0) {
    if (missing.length === agentIds.length) {
      yield* emitNoOpOutcome("agents.remove", {
        planName: "Remove coding agents",
        planDescription: `Remove ${agentIds.join(", ")} and clean up managed artifacts`,
        message: "All requested agents are already absent",
      });
      return;
    }
    return yield* makeAppError({
      code: "validation",
      detail: `Agent is not configured: ${missing.join(", ")}`,
      suggestions: [{ description: "Inspect configured agents.", cmd: "axm agents list" }],
    });
  }

  const removedAgentIds = new Set(agentIds);
  const cleanupServices = { ws, fs, path, agentRepo };
  const cleanupPreview = yield* provideCleanupServices(
    cleanupManagedArtifactsForRemovedAgents({ removedAgentIds, dryRun: true }),
    cleanupServices,
  );
  const steps = [
    cleanupStep(removedAgentIds, cleanupServices, cleanupPreview),
    ...agentIds.map((agentId) => removeAgentStep(ws, agentId)),
  ];
  const atomicSteps = yield* makeAtomicMembershipSteps({
    ws,
    steps,
    validate: () =>
      ws
        .getConfiguredAgents()
        .pipe(Effect.mapError(toAppError))
        .pipe(
          Effect.flatMap((current) => {
            const currentSet = new Set(current);
            const retained = agentIds.filter((agentId) => currentSet.has(agentId));
            return retained.length === 0
              ? Effect.void
              : makeAppError({
                  code: "internal",
                  detail: `Agent membership transition did not remove: ${retained.join(", ")}`,
                });
          }),
        ),
  });
  const plan = makePlan(agentIds, atomicSteps);

  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["agents", "remove"],
    agentIds,
    args.force ? ["accept-warnings"] : [],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });

  const suggestions = [{ description: "Inspect configured agents", cmd: "axm agents list" }];
  yield* emitOperationResolution("agents.remove", resolution, { suggestions });
});

const removeConfig = {
  ids: Argument.string("id").pipe(
    Argument.withDescription("Configured coding-agent IDs to remove"),
    Argument.atLeast(1),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Remove agents from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  force: acceptWarningsFlag,
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
} as const;

export const removeCommand = Command.make(
  "remove",
  removeConfig,
  ({ ids, scope, yes, force, preview }) =>
    handleAgentsRemove({ ids: [...ids], yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("agents remove"),
    ),
).pipe(
  withArgvTracking(removeConfig),
  Command.withDescription("Remove coding-agent harnesses and clean up AXM-managed artifacts"),
  Command.withExamples([
    { command: "axm agents remove cursor", description: "Remove Cursor from this workspace" },
    {
      command: "axm agents remove cursor --preview",
      description: "Preview managed artifact cleanup",
    },
  ]),
);
