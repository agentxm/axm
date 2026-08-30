import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { detectAgentsForScope } from "@agentxm/extension-management/unstable/agents";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  acceptWarningsFlag,
  previewFlag,
  yesFlag,
} from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  deriveOperationOutcome,
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/extension-management/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { collectMaterializeSteps } from "../sync/handler.js";
import { makeAtomicMembershipSteps } from "./atomic-membership.js";
import { isRetiredAgent, lifecycleWarning } from "./lifecycle.js";
import { buildPermissionSuggestions } from "./permission-suggestions.js";
import { dedupe, validateAgentIds } from "./shared.js";

export interface AgentsAddArgs {
  readonly ids: ReadonlyArray<string>;
  readonly detected: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const addAgentStep = (ws: WorkspaceMutationsService, agentId: string): PlannedJobStep => ({
  label: `Add ${agentId}`,
  readiness: "ready",
  artifact: {
    path: workspaceSettingsPath(ws.scope),
    scope: ws.scope,
    agents: [agentId],
    change: "updated",
    fileCount: 1,
    targets: [{ path: workspaceSettingsPath(ws.scope), change: "updated", agentIds: [agentId] }],
  },
  run: ws.addConfiguredAgent(agentId).pipe(
    Effect.as({
      result: "success",
      message: `Configured ${agentId}`,
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

const materializationArtifact = (
  ws: WorkspaceMutationsService,
  agentIds: ReadonlyArray<string>,
): JobStepArtifact => ({
  path: "managed agent artifacts",
  scope: ws.scope,
  agents: agentIds,
  change: "updated",
  targets: agentIds.map((agentId) => ({
    path: `${agentId} managed agent artifacts`,
    change: "updated",
    agentIds: [agentId],
  })),
});

const targetMatchesAgents = (
  targetAgents: ReadonlyArray<string> | undefined,
  agentIds: ReadonlyArray<string>,
): boolean =>
  targetAgents === undefined ||
  targetAgents.length === 0 ||
  targetAgents.some((agentId) => agentIds.includes(agentId));

const aggregateArtifactChange = (
  targets: ReadonlyArray<{ readonly change: JobStepArtifact["change"] }>,
  fallback: JobStepArtifact["change"],
): JobStepArtifact["change"] => {
  if (targets.length === 0) return fallback;
  if (targets.some((target) => target.change === "created")) return "created";
  if (targets.some((target) => target.change === "updated")) return "updated";
  if (targets.some((target) => target.change === "removed")) return "removed";
  return "unchanged";
};

const filterMaterializationArtifact = (
  artifact: JobStepArtifact,
  agentIds: ReadonlyArray<string>,
): JobStepArtifact => {
  if (artifact.targets === undefined || artifact.targets.length === 0) {
    return artifact;
  }
  const targets = artifact.targets.filter((target) =>
    targetMatchesAgents(target.agentIds, agentIds),
  );
  if (targets.length === 0) {
    return artifact;
  }
  const agents = artifact.agents?.filter((agentId) => agentIds.includes(agentId));
  return {
    ...artifact,
    path: targets[0]?.path ?? artifact.path,
    ...(agents === undefined || agents.length === 0 ? {} : { agents }),
    change: aggregateArtifactChange(targets, artifact.change),
    targets,
  };
};

const attachMaterializationArtifact = <Requirements, Output>(
  ws: WorkspaceMutationsService,
  agentIds: ReadonlyArray<string>,
  step: PlannedJobStep<Requirements, Output>,
): PlannedJobStep<Requirements, Output> => {
  if (step.readiness === "error") return step;
  const artifact =
    step.artifact === undefined
      ? materializationArtifact(ws, agentIds)
      : filterMaterializationArtifact(step.artifact, agentIds);
  return {
    ...step,
    artifact,
    run: Effect.gen(function* () {
      const result = yield* step.run;
      if (result.result === "error") return result;
      if (result.artifact !== undefined) {
        return {
          ...result,
          artifact: filterMaterializationArtifact(result.artifact, agentIds),
        };
      }
      return {
        ...result,
        artifact: materializationArtifact(ws, agentIds),
      };
    }),
  };
};

const makePlan = <Requirements, Output>(
  agentIds: ReadonlyArray<string>,
  steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>,
): Plan<Requirements, Output> => ({
  _tag: "Plan",
  name: "Add coding agents",
  description: Option.some(`Configure ${agentIds.join(", ")} and materialize installed extensions`),
  presentation: {
    verb: { imperative: "configure", past: "Configured", gerund: "Configuring" },
    subject: { singular: "agent", plural: "agents" },
  },
  jobs: [{ concurrency: 1, executionPolicy: "best-effort", steps }],
});

export const handleAgentsAdd = (args: AgentsAddArgs) =>
  withOperationLifecycle(
    {
      command: "agents.add",
      mode: args.preview ? "preview" : "apply",
      planName: "Add coding agents",
    },
    handleAgentsAddBody(args),
  );

const handleAgentsAddBody = Effect.fn("Agents.add")(function* (args: AgentsAddArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;

  if (args.ids.length === 0 && !args.detected) {
    return yield* makeAppError({
      code: "usage",
      detail: "Provide one or more agent IDs, or pass --detected.",
      suggestions: [
        { description: "List supported IDs.", cmd: "axm agents list --available" },
        { description: "Configure detected agents.", cmd: "axm agents add --detected" },
      ],
    });
  }

  const requested = yield* validateAgentIds(args.ids);
  const configured = yield* ws.getConfiguredAgents();
  const configuredSet = new Set(configured);
  const detected = args.detected
    ? yield* renderer.withSpinner(
        "Detecting coding agents",
        () =>
          detectAgentsForScope(ws.baseDir, ws.scope).pipe(
            Effect.map((agents) => agents.map((agent) => agent.id)),
          ),
        { successMessage: "Detected coding agents" },
      )
    : [];
  const detectedConfigurable = yield* validateAgentIds(detected);
  const requestedSet = new Set(requested);
  const retiredDetected = detectedConfigurable.filter(
    (id) => isRetiredAgent(id) && !requestedSet.has(id),
  );
  const autoDetected = detectedConfigurable.filter(
    (id) => !isRetiredAgent(id) || requestedSet.has(id),
  );
  for (const agentId of retiredDetected) {
    yield* renderer.warn(
      `${lifecycleWarning(agentId) ?? `${agentId} is retired.`} It was not added automatically; run \`axm agents add ${agentId}\` to opt in.`,
    );
  }
  const agentIds = dedupe([...requested, ...autoDetected]).filter((id) => !configuredSet.has(id));

  if (agentIds.length === 0) {
    yield* emitNoOpOutcome("agents.add", {
      planName: "Add coding agents",
      planDescription: "Configure coding agents and materialize installed extensions",
      message:
        retiredDetected.length > 0 && requested.length === 0
          ? "No active detected agents to configure"
          : "All requested agents are already configured",
      ...(retiredDetected.length === 0
        ? {}
        : {
            suggestions: retiredDetected.map((agentId) => ({
              description: `Explicitly configure retired agent ${agentId}.`,
              cmd: `axm agents add ${agentId}`,
            })),
          }),
    });
    return;
  }

  // Warn rather than block: the workspace may still need a retired agent
  // configured, but the user should know the vendor has stopped maintaining it.
  const lifecycleWarnings = agentIds.flatMap((agentId) => {
    const warning = lifecycleWarning(agentId);
    return warning === undefined ? [] : [`${agentId}: ${warning}`];
  });
  for (const warning of lifecycleWarnings) yield* renderer.warn(warning);

  const materialize = yield* renderer.withSpinner(
    "Resolving installed extension materialization",
    () =>
      collectMaterializeSteps({
        selection: { target: Option.none(), type: Option.none() },
        configuredAgents: [...configured, ...agentIds],
      }),
    { successMessage: "Resolved installed extension materialization" },
  );
  const materializeSteps = materialize.steps.map((step) =>
    attachMaterializationArtifact(ws, agentIds, step),
  );
  const steps = [...agentIds.map((agentId) => addAgentStep(ws, agentId)), ...materializeSteps];
  const atomicSteps = yield* makeAtomicMembershipSteps({
    ws,
    steps,
    validate: () =>
      ws.getConfiguredAgents().pipe(
        Effect.flatMap((current) => {
          const currentSet = new Set(current);
          const missing = agentIds.filter((agentId) => !currentSet.has(agentId));
          return missing.length === 0
            ? Effect.void
            : makeAppError({
                code: "internal",
                detail: `Agent membership transition did not configure: ${missing.join(", ")}`,
              });
        }),
      ),
  });
  const basePlan = makePlan(agentIds, atomicSteps);
  const plan =
    lifecycleWarnings.length === 0
      ? basePlan
      : {
          ...basePlan,
          riskConditions: [
            {
              level: "override-required" as const,
              id: "retired-agent-lifecycle-warnings",
              policy: "accept-warnings" as const,
              requiredFlag: "--accept-warnings",
              detail: lifecycleWarnings.join("; "),
            },
          ],
        };

  // Goes through the reconciling resolver rather than the local one: adding an
  // agent materializes installed extensions, which needs a readable lockfile.
  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["agents", "add"],
    agentIds,
    args.force ? ["accept-warnings"] : [],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  const outcome = deriveOperationOutcome(resolution);
  const suggestions =
    outcome === "applied" || outcome === "partial" ? buildPermissionSuggestions(agentIds) : [];
  yield* emitOperationResolution("agents.add", resolution, { suggestions });
});

const addConfig = {
  ids: Argument.string("id").pipe(
    Argument.withDescription("Coding-agent IDs to configure, such as claude-code or cursor"),
    Argument.atLeast(0),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Add agents to project (default) or user-level configuration"),
  ),
  detected: Flag.boolean("detected").pipe(
    Flag.withDescription("Add detected agents"),
    Flag.withDefault(false),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  force: acceptWarningsFlag,
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
} as const;

export const addCommand = Command.make(
  "add",
  addConfig,
  ({ ids, scope, detected, yes, force, preview }) =>
    handleAgentsAdd({ ids: [...ids], detected, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("agents add"),
    ),
).pipe(
  withArgvTracking(addConfig),
  Command.withDescription("Configure coding-agent harnesses and materialize installed extensions"),
  Command.withExamples([
    { command: "axm agents add cursor", description: "Add Cursor to this workspace" },
    {
      command: "axm agents add cursor codex --preview",
      description: "Preview configuring multiple agents",
    },
    { command: "axm agents add --detected", description: "Configure all detected agents" },
  ]),
);
