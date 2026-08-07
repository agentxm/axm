import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/client-core/unstable/agents";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  acceptWarningsFlag,
  previewFlag,
  Verbosity,
  yesFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import {
  type CompletedJobStep,
  type ExecutedPlan,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
  previewOrApplyPlan,
} from "@agentxm/client-core/unstable/plan";
import {
  cleanupManagedArtifactsForRemovedAgents,
  type RemovedAgentArtifactCleanupResult,
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { makeAtomicMembershipSteps } from "./atomic-membership.js";
import { validateAgentIds } from "./shared.js";

const AGENT_SETTINGS_PATH = ".axm/settings.json";

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

const provideCleanupServices = <A>(
  effect: Effect.Effect<
    A,
    AppError,
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

const formatArtifactTargets = (artifact: JobStepArtifact): string => {
  if (artifact.targets === undefined || artifact.targets.length === 0) {
    return artifact.path;
  }
  return artifact.targets
    .map((target) => {
      const agents =
        target.agentIds === undefined || target.agentIds.length === 0
          ? undefined
          : ` [${target.agentIds.join(", ")}]`;
      return `${target.path} (${target.change})${agents ?? ""}`;
    })
    .join(", ");
};

const formatCompletedArtifactStep = (step: CompletedJobStep): string | undefined => {
  if (step.result.result !== "success" || step.result.artifact === undefined) return undefined;
  const artifact = step.result.artifact;
  const details = [
    artifact.change,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    formatArtifactTargets(artifact),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return `${step.label}   ${details.join("   ")}`;
};

const summarizeExecutedArtifacts = (plan: ExecutedPlan): string | undefined => {
  const rows = plan.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) => {
      const summary = formatCompletedArtifactStep(step);
      return summary === undefined ? [] : [summary];
    });
  return rows.length === 0 ? undefined : rows.join("\n");
};

const removeAgentStep = (ws: WorkspaceMutationsService, agentId: string): PlannedJobStep => ({
  label: `Remove ${agentId}`,
  readiness: "ready",
  artifact: {
    path: AGENT_SETTINGS_PATH,
    scope: ws.scope,
    agents: [agentId],
    change: "updated",
    fileCount: 1,
    targets: [{ path: AGENT_SETTINGS_PATH, change: "updated", agentIds: [agentId] }],
  },
  run: ws.removeConfiguredAgent(agentId).pipe(
    Effect.as({
      result: "success",
      message: `Removed ${agentId}`,
      artifact: {
        path: AGENT_SETTINGS_PATH,
        scope: ws.scope,
        agents: [agentId],
        change: "updated",
        fileCount: 1,
        targets: [{ path: AGENT_SETTINGS_PATH, change: "updated", agentIds: [agentId] }],
      },
    } satisfies JobStepResult),
  ),
});

const makePlan = (agentIds: ReadonlyArray<string>, steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Remove coding agents",
  description: Option.some(`Remove ${agentIds.join(", ")} and clean up managed artifacts`),
  jobs: [{ concurrency: 1, steps }],
});

export const handleAgentsRemove = Effect.fn("Agents.remove")(function* (args: AgentsRemoveArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  const agentIds = yield* validateAgentIds(args.ids);
  const configured = yield* ws.getConfiguredAgents();
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
      ws.getConfiguredAgents().pipe(
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

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
    displayApplied: false,
  });

  const fallbackSummary = [
    `-> ${AGENT_SETTINGS_PATH}   ${count(agentIds.length, "agent")}`,
    "-> managed agent artifacts   cleanup",
  ].join("\n");
  const summary =
    resolution._tag === "ExecutedPlan"
      ? (summarizeExecutedArtifacts(resolution) ?? fallbackSummary)
      : fallbackSummary;
  const suggestions = [{ description: "Inspect configured agents", cmd: "axm agents list" }];
  const emitted = yield* emitPlanResolutionResult(
    "agents.remove",
    resolution,
    resolution._tag === "ExecutedPlan" ? { summary, suggestions } : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    yield* renderer.success(
      `Removed ${count(agentIds.length, "agent")}`,
      verbosity.level === "quiet"
        ? undefined
        : {
            summary,
            suggestions,
            withoutSuggestions: emitted,
          },
    );
  }
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
  Command.withAlias("rm"),
  Command.withDescription("Remove coding-agent harnesses and clean up AXM-managed artifacts"),
  Command.withExamples([
    { command: "axm agents remove cursor", description: "Remove Cursor from this workspace" },
    {
      command: "axm agents remove cursor --preview",
      description: "Preview managed artifact cleanup",
    },
  ]),
);
