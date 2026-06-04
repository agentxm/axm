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
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import {
  applyPlan,
  type JobStepResult,
  type Plan,
  type PlanResolution,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  cleanupManagedArtifactsForRemovedAgents,
  displayPlan,
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { validateAgentIds } from "./shared.js";

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
): PlannedJobStep => ({
  label: "Remove managed agent artifacts",
  readiness: "ready",
  run: provideCleanupServices(
    cleanupManagedArtifactsForRemovedAgents({ removedAgentIds }).pipe(
      Effect.map(
        (result) =>
          ({
            result: "success",
            message: `Removed ${count(result.removedPaths.length, "managed artifact")}`,
          }) satisfies JobStepResult,
      ),
    ),
    services,
  ),
});

const removeAgentStep = (ws: WorkspaceMutationsService, agentId: string): PlannedJobStep => ({
  label: `Remove ${agentId}`,
  readiness: "ready",
  run: ws.removeConfiguredAgent(agentId).pipe(
    Effect.as({
      result: "success",
      message: `Removed ${agentId}`,
    } satisfies JobStepResult),
  ),
});

const makePlan = (agentIds: ReadonlyArray<string>, steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Remove coding agents",
  description: Option.some(`Remove ${agentIds.join(", ")} and clean up managed artifacts`),
  jobs: [{ concurrency: 1, steps }],
});

const previewPlan = (plan: Plan): PlanResolution => ({
  _tag: "PreviewedPlan",
  name: plan.name,
  description: plan.description,
  jobs: plan.jobs,
});

export const handleAgentsRemove = Effect.fn("Agents.remove")(function* (args: AgentsRemoveArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  const agentIds = yield* validateAgentIds(args.ids);
  const configured = yield* ws.getConfiguredAgents();
  const configuredSet = new Set(configured);
  const missing = agentIds.filter((id) => !configuredSet.has(id));

  if (missing.length > 0) {
    return yield* makeAppError({
      code: "validation",
      detail: `Agent is not configured: ${missing.join(", ")}`,
      suggestions: [{ description: "Run `axm agents list` to see configured agents." }],
    });
  }

  const removedAgentIds = new Set(agentIds);
  const cleanupServices = { ws, fs, path, agentRepo };
  const plan = makePlan(agentIds, [
    cleanupStep(removedAgentIds, cleanupServices),
    ...agentIds.map((agentId) => removeAgentStep(ws, agentId)),
  ]);

  const resolution = args.preview
    ? yield* Effect.gen(function* () {
        yield* renderer.info("Previewing changes...");
        yield* displayPlan(plan);
        return previewPlan(plan);
      })
    : yield* applyPlan(plan).pipe(Effect.tap(displayPlan));

  yield* emitPlanResolutionResult("agents.remove", resolution);
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
  force: forceFlag.pipe(Flag.withDescription("Apply even if the plan has unresolved warnings")),
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
