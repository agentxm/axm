/**
 * Configured-agent membership: which coding agents this workspace configures,
 * and the change a request makes to that set.
 *
 * Membership is a set of decisions, not a list of writes. Adding names the
 * agents a request actually configures — the ids it gave plus what detection
 * found, minus the ones already configured and the ones whose vendor retired
 * them unless the request named them itself. Removing names the agents that
 * leave and the projection state the workspace must be reconciled to once
 * they have. Either change settles atomically: the recorded set and the agent
 * outputs realized for it move together or not at all.
 *
 * Realizing installed extensions for a new membership, and cleaning up the
 * outputs a departing agent owned, are reconciliation work. The application
 * plans those steps through the reconciliation feature and hands them to
 * `previewOrApply` as ordinary plan steps, so this feature never depends on a
 * peer feature and the whole change still settles as one closure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { detectAgentsForScope } from "@agentxm/agent-integration";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";
import type { PerAgentType } from "@agentxm/extension-model/unstable/extensions/common";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  OperationJournal,
  observeUnit,
  prepareExecutionCandidate,
  ResolvePlanInteraction,
  resolveExecutionCandidate,
  type JobStepArtifact,
  type JobStepResult,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  UNIVERSAL_AGENT_ID,
  expectedProjectionNames,
  observeInstructionProjection,
  resolveInstructionsConfig,
} from "@agentxm/workspace-projection";
import {
  ConfiguredAgentOutcomesProvider,
  WorkspaceMutations,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
import { FootprintRecorder, WorkspaceTransactionScope } from "@agentxm/workspace-transactions";

import {
  WorkspaceConfigurationFailed,
  workspaceChangeFailedToStepFailure,
  type WorkspaceConfigurationExecutionFailure,
} from "../errors.js";
import { agentLifecycle, isRetiredAgent, lifecycleWarning } from "./agent-lifecycle.js";
import { makeAtomicMembershipSteps } from "./atomic-membership.js";
import { dedupe, validateAgentIds } from "./validate-agent-ids.js";

// -----------------------------------------------------------------------------
// Shared vocabulary
// -----------------------------------------------------------------------------

/** Every failure a membership request settles into before it is planned. */
export type ConfigureAgentsFailure =
  | WorkspaceConfigurationFailed
  | WorkspaceStateReadFailure
  | Effect.Error<ReturnType<typeof detectAgentsForScope>>;

/** Every failure resolving a prepared membership change can surface. */
export type MembershipExecutionFailure = WorkspaceConfigurationExecutionFailure;

/** Stable workspace-relative path of the settings file membership is recorded in. */
const settingsDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/workspace/axm.json";

const membershipArtifact = (
  scope: WorkspaceScope,
  agentId: string,
  change: JobStepArtifact["change"],
): JobStepArtifact => ({
  path: settingsDisplayPath(scope),
  scope,
  agents: [agentId],
  change,
  fileCount: 1,
  targets: [{ path: settingsDisplayPath(scope), change, agentIds: [agentId] }],
});

/**
 * A request that changes nothing still has an answer: what it named and why
 * the workspace already satisfies it.
 */
export interface ConfiguredAgentsUnchanged {
  readonly _tag: "Unchanged";
  readonly reason: "already-configured" | "no-active-detected" | "already-absent";
  readonly message: string;
  /** Retired agents detection offered and did not configure, if any. */
  readonly retiredDetected: ReadonlyArray<RetiredAgentNotice>;
}

/** A retired agent detection found, and why a person should know about it. */
export interface RetiredAgentNotice {
  readonly agentId: string;
  /** The vendor-lifecycle sentence, and that detection did not configure it. */
  readonly detail: string;
}

const unchanged = (
  reason: ConfiguredAgentsUnchanged["reason"],
  message: string,
  retiredDetected: ReadonlyArray<RetiredAgentNotice> = [],
): ConfiguredAgentsUnchanged => ({ _tag: "Unchanged", reason, message, retiredDetected });

// -----------------------------------------------------------------------------
// Add
// -----------------------------------------------------------------------------

export interface AddConfiguredAgentsRequest {
  /** Agent ids the person named explicitly. */
  readonly ids: ReadonlyArray<string>;
  /** Also configure the agents detection finds for this workspace's scope. */
  readonly detected: boolean;
  /** The person accepted the vendor-lifecycle warnings this change carries. */
  readonly acceptWarnings?: boolean;
}

export interface AddConfiguredAgentsCandidate {
  readonly _tag: "AddConfiguredAgents";
  /** The agents this change configures, in the order they were decided. */
  readonly agentIds: ReadonlyArray<string>;
  /** The membership the workspace holds once the change settles. */
  readonly configuredAgents: ReadonlyArray<string>;
  /**
   * Retired agents detection offered. They are not configured by detection
   * alone; naming one explicitly configures it and warns.
   */
  readonly retiredDetected: ReadonlyArray<RetiredAgentNotice>;
  /** One sentence per configured agent whose vendor no longer maintains it. */
  readonly lifecycleWarnings: ReadonlyArray<string>;
  readonly acceptWarnings: boolean;
  readonly scope: WorkspaceScope;
}

/**
 * Settle which agents an add request configures.
 *
 * Explicitly named ids are validated first, so a typo is refused before
 * detection runs. Detection contributes what it found minus the agents whose
 * vendor retired them: a retired agent is a deliberate choice, never a
 * consequence of having it installed.
 */
export const prepareAddConfiguredAgents = (
  request: AddConfiguredAgentsRequest,
): Effect.Effect<
  AddConfiguredAgentsCandidate | ConfiguredAgentsUnchanged,
  ConfigureAgentsFailure,
  WorkspaceMutations | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;

    if (request.ids.length === 0 && !request.detected) {
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: "Provide one or more agent IDs, or pass --detected.",
        suggestions: [
          { description: "List supported IDs.", cmd: "axm agents list --available" },
          { description: "Configure detected agents.", cmd: "axm agents add --detected" },
        ],
      });
    }

    const requested = yield* validateAgentIds(request.ids);
    const configured = yield* workspace.getConfiguredAgents();
    const configuredSet = new Set(configured);
    const detected = request.detected
      ? yield* observeUnit(
          { id: "detect-agents", label: "coding agent detection" },
          detectAgentsForScope(workspace.baseDir, workspace.scope).pipe(
            Effect.map((agents) => agents.map((agent) => agent.id)),
          ),
        )
      : [];
    const detectedConfigurable = yield* validateAgentIds(detected);
    const requestedSet = new Set(requested);
    const retiredDetected = detectedConfigurable.flatMap((id) =>
      isRetiredAgent(id) && !requestedSet.has(id)
        ? [
            {
              agentId: id,
              detail: `${lifecycleWarning(id) ?? `${id} is retired.`} It was not added automatically; run \`axm agents add ${id}\` to opt in.`,
            } satisfies RetiredAgentNotice,
          ]
        : [],
    );
    const autoDetected = detectedConfigurable.filter(
      (id) => !isRetiredAgent(id) || requestedSet.has(id),
    );
    const agentIds = dedupe([...requested, ...autoDetected]).filter((id) => !configuredSet.has(id));

    if (agentIds.length === 0) {
      return unchanged(
        retiredDetected.length > 0 && requested.length === 0
          ? "no-active-detected"
          : "already-configured",
        retiredDetected.length > 0 && requested.length === 0
          ? "No active detected agents to configure"
          : "All requested agents are already configured",
        retiredDetected,
      );
    }

    // Warn rather than block: the workspace may still need a retired agent
    // configured, but the person must know the vendor stopped maintaining it.
    const lifecycleWarnings = agentIds.flatMap((agentId) => {
      const warning = lifecycleWarning(agentId);
      return warning === undefined ? [] : [`${agentId}: ${warning}`];
    });

    return {
      _tag: "AddConfiguredAgents",
      agentIds,
      configuredAgents: [...configured, ...agentIds],
      retiredDetected,
      lifecycleWarnings,
      acceptWarnings: request.acceptWarnings ?? false,
      scope: workspace.scope,
    } satisfies AddConfiguredAgentsCandidate;
  });

/**
 * Steps the application planned through the reconciliation feature, applied
 * inside this change's closure so membership and realized outputs settle
 * together.
 */
export interface MembershipReconciliation<Requirements, Output> {
  readonly steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>;
}

/**
 * The plan pipeline a membership change resolves through, plus the workspace
 * transition its steps settle inside. `Requirements` carries whatever the
 * reconciliation steps the application supplied still need.
 */
export type MembershipExecutionRequirements<Requirements> =
  | Requirements
  | ConfiguredAgentOutcomesProvider
  | FileSystem.FileSystem
  | FootprintRecorder
  | OperationJournal
  | Path.Path
  | ResolvePlanInteraction
  | WorkspaceMutations
  | WorkspaceTransactionScope;

const addAgentStep = <Output>(
  scope: WorkspaceScope,
  agentId: string,
): PlannedJobStep<WorkspaceMutations, Output> => ({
  label: `Add ${agentId}`,
  readiness: "ready",
  artifact: membershipArtifact(scope, agentId, "updated"),
  run: Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    yield* workspace
      .addConfiguredAgent(agentId)
      .pipe(Effect.mapError(workspaceChangeFailedToStepFailure));
    return {
      result: "success",
      message: `Configured ${agentId}`,
      artifact: membershipArtifact(scope, agentId, "updated"),
    } satisfies JobStepResult<Output>;
  }),
});

/** Aggregate a filtered artifact's change from the targets that survived. */
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

const materializationArtifact = (
  scope: WorkspaceScope,
  agentIds: ReadonlyArray<string>,
): JobStepArtifact => ({
  path: "managed agent artifacts",
  scope,
  agents: agentIds,
  change: "updated",
  targets: agentIds.map((agentId) => ({
    path: `${agentId} managed agent artifacts`,
    change: "updated" as const,
    agentIds: [agentId],
  })),
});

/**
 * A reconciliation step planned for the whole workspace reports every agent
 * it touches. Adding agents only claims the arriving ones, so each artifact
 * is narrowed to the targets that belong to them.
 */
const narrowToArrivingAgents = (
  artifact: JobStepArtifact,
  agentIds: ReadonlyArray<string>,
): JobStepArtifact => {
  if (artifact.targets === undefined || artifact.targets.length === 0) return artifact;
  const targets = artifact.targets.filter(
    (target) =>
      target.agentIds === undefined ||
      target.agentIds.length === 0 ||
      target.agentIds.some((agentId) => agentIds.includes(agentId)),
  );
  if (targets.length === 0) return artifact;
  const agents = artifact.agents?.filter((agentId) => agentIds.includes(agentId));
  return {
    ...artifact,
    path: targets[0]?.path ?? artifact.path,
    ...(agents === undefined || agents.length === 0 ? {} : { agents }),
    change: aggregateArtifactChange(targets, artifact.change),
    targets,
  };
};

const attributeToArrivingAgents = <Requirements, Output>(
  scope: WorkspaceScope,
  agentIds: ReadonlyArray<string>,
  step: PlannedJobStep<Requirements, Output>,
): PlannedJobStep<Requirements, Output> => {
  if (step.readiness === "error") return step;
  const artifact =
    step.artifact === undefined
      ? materializationArtifact(scope, agentIds)
      : narrowToArrivingAgents(step.artifact, agentIds);
  return {
    ...step,
    artifact,
    run: Effect.gen(function* () {
      const result = yield* step.run;
      if (result.result === "error") return result;
      return result.artifact === undefined
        ? { ...result, artifact: materializationArtifact(scope, agentIds) }
        : { ...result, artifact: narrowToArrivingAgents(result.artifact, agentIds) };
    }),
  };
};

const addPlan = <Requirements, Output>(
  candidate: AddConfiguredAgentsCandidate,
  steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>,
): Plan<Requirements, Output> => ({
  _tag: "Plan",
  name: "Add coding agents",
  description: Option.some(
    `Configure ${candidate.agentIds.join(", ")} and materialize installed extensions`,
  ),
  presentation: {
    verb: { imperative: "configure", past: "Configured", gerund: "Configuring" },
    subject: { singular: "agent", plural: "agents" },
  },
  ...(candidate.lifecycleWarnings.length === 0
    ? {}
    : {
        riskConditions: [
          {
            level: "override-required" as const,
            id: "retired-agent-lifecycle-warnings",
            policy: "accept-warnings" as const,
            requiredFlag: "--accept-warnings",
            detail: candidate.lifecycleWarnings.join("; "),
          },
        ],
      }),
  jobs: [{ concurrency: 1, executionPolicy: "best-effort", steps }],
});

/**
 * Preview or apply a settled add. The membership writes and the supplied
 * reconciliation steps run inside one workspace transaction, and the
 * transaction only settles once the workspace reports the arriving agents as
 * configured.
 */
export const previewOrApplyAddConfiguredAgents = <MaterializeRequirements = never, Output = void>(
  candidate: AddConfiguredAgentsCandidate,
  execution: PlanExecution,
  reconciliation?: MembershipReconciliation<MaterializeRequirements, Output>,
): Effect.Effect<
  OperationResolution<Output>,
  MembershipExecutionFailure,
  MembershipExecutionRequirements<MaterializeRequirements>
> =>
  Effect.gen(function* () {
    const materialization = (reconciliation?.steps ?? []).map((step) =>
      attributeToArrivingAgents(candidate.scope, candidate.agentIds, step),
    );
    const steps: ReadonlyArray<
      PlannedJobStep<MaterializeRequirements | WorkspaceMutations, Output>
    > = [
      ...candidate.agentIds.map((agentId) => addAgentStep<Output>(candidate.scope, agentId)),
      ...materialization,
    ];
    const atomicSteps = yield* makeAtomicMembershipSteps({
      steps,
      transition: { kind: "add", agentIds: candidate.agentIds },
    });
    const prepared = yield* prepareExecutionCandidate(addPlan(candidate, atomicSteps));
    return yield* resolveExecutionCandidate(prepared, execution);
  });

// -----------------------------------------------------------------------------
// Remove
// -----------------------------------------------------------------------------

export interface RemoveConfiguredAgentsRequest {
  readonly ids: ReadonlyArray<string>;
}

/** The projection state the workspace is reconciled to once the agents leave. */
export interface DepartingAgentReconciliation {
  readonly desiredAgentIds: ReadonlySet<string>;
  readonly expectedNames: Readonly<Record<PerAgentType, ReadonlySet<string>>>;
}

export interface RemoveConfiguredAgentsCandidate {
  readonly _tag: "RemoveConfiguredAgents";
  readonly agentIds: ReadonlyArray<string>;
  /** The membership the workspace holds once the change settles. */
  readonly configuredAgents: ReadonlyArray<string>;
  readonly reconciliation: DepartingAgentReconciliation;
  /** The workspace root removed artifacts are reported relative to. */
  readonly baseDir: string;
  readonly scope: WorkspaceScope;
}

/**
 * Settle which agents a remove request takes out of membership, and the
 * reconciliation state their outputs are cleaned up against.
 *
 * Removing every named agent when none of them is configured is a reported
 * no-op; removing a mixture is a refusal, because the request described a
 * workspace that does not exist. Cleaning up owned projections needs a
 * complete desired graph — without one, AXM cannot tell its own output from
 * a person's file, so it refuses rather than guess.
 */
export const prepareRemoveConfiguredAgents = (
  request: RemoveConfiguredAgentsRequest,
): Effect.Effect<
  RemoveConfiguredAgentsCandidate | ConfiguredAgentsUnchanged,
  ConfigureAgentsFailure,
  WorkspaceMutations
> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const agentIds = yield* validateAgentIds(request.ids);
    const configured = yield* workspace.getConfiguredAgents();
    const configuredSet = new Set(configured);
    const missing = agentIds.filter((id) => !configuredSet.has(id));

    if (missing.length === agentIds.length) {
      return unchanged("already-absent", "All requested agents are already absent");
    }
    if (missing.length > 0) {
      return yield* new WorkspaceConfigurationFailed({
        category: "validation",
        detail: `Agent is not configured: ${missing.join(", ")}`,
        suggestions: [{ description: "Inspect configured agents.", cmd: "axm agents list" }],
      });
    }

    const graph = yield* workspace.getDesiredStateGraph();
    if (!graph.complete) {
      return yield* new WorkspaceConfigurationFailed({
        category: "validation",
        detail: "Cannot safely clean agent projections while desired workspace state is incomplete",
        suggestions: [{ description: "Inspect workspace facts.", cmd: "axm lint" }],
      });
    }

    const departing = new Set(agentIds);
    const remaining = configured.filter((agentId) => !departing.has(agentId));
    return {
      _tag: "RemoveConfiguredAgents",
      agentIds,
      configuredAgents: remaining,
      reconciliation: {
        desiredAgentIds: new Set([UNIVERSAL_AGENT_ID, ...remaining]),
        expectedNames: expectedProjectionNames(graph),
      },
      baseDir: workspace.baseDir,
      scope: workspace.scope,
    } satisfies RemoveConfiguredAgentsCandidate;
  });

const removeAgentStep = <Output>(
  scope: WorkspaceScope,
  agentId: string,
): PlannedJobStep<WorkspaceMutations, Output> => ({
  label: `Remove ${agentId}`,
  readiness: "ready",
  artifact: membershipArtifact(scope, agentId, "updated"),
  run: Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    yield* workspace
      .removeConfiguredAgent(agentId)
      .pipe(Effect.mapError(workspaceChangeFailedToStepFailure));
    return {
      result: "success",
      message: `Removed ${agentId}`,
      artifact: membershipArtifact(scope, agentId, "updated"),
    } satisfies JobStepResult<Output>;
  }),
});

const removePlan = <Requirements, Output>(
  candidate: RemoveConfiguredAgentsCandidate,
  steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>,
): Plan<Requirements, Output> => ({
  _tag: "Plan",
  name: "Remove coding agents",
  description: Option.some(
    `Remove ${candidate.agentIds.join(", ")} and clean up managed artifacts`,
  ),
  presentation: {
    verb: { imperative: "remove", past: "Removed", gerund: "Removing" },
    subject: { singular: "agent", plural: "agents" },
  },
  jobs: [{ concurrency: 1, executionPolicy: "best-effort", steps }],
});

/**
 * Preview or apply a settled removal. The cleanup steps the application
 * planned run before the membership writes and inside the same transaction,
 * so a cleanup that cannot complete leaves the agent configured.
 */
export const previewOrApplyRemoveConfiguredAgents = <CleanupRequirements = never, Output = void>(
  candidate: RemoveConfiguredAgentsCandidate,
  execution: PlanExecution,
  reconciliation?: MembershipReconciliation<CleanupRequirements, Output>,
): Effect.Effect<
  OperationResolution<Output>,
  MembershipExecutionFailure,
  MembershipExecutionRequirements<CleanupRequirements>
> =>
  Effect.gen(function* () {
    const steps: ReadonlyArray<PlannedJobStep<CleanupRequirements | WorkspaceMutations, Output>> = [
      ...(reconciliation?.steps ?? []),
      ...candidate.agentIds.map((agentId) => removeAgentStep<Output>(candidate.scope, agentId)),
    ];
    const atomicSteps = yield* makeAtomicMembershipSteps({
      steps,
      transition: { kind: "remove", agentIds: candidate.agentIds },
    });
    const prepared = yield* prepareExecutionCandidate(removePlan(candidate, atomicSteps));
    return yield* resolveExecutionCandidate(prepared, execution);
  });

// -----------------------------------------------------------------------------
// List
// -----------------------------------------------------------------------------

const ConfiguredAgentRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  configured: Schema.Boolean,
  detected: Schema.Boolean,
  /** Instruction-projection health for a configured agent; `-` when not configured. */
  instructions: Schema.String,
  /** Whether the vendor still maintains the agent: active, deprecated, retired. */
  lifecycle: Schema.String,
});
export type ConfiguredAgentRow = typeof ConfiguredAgentRowSchema.Type;

export const ConfiguredAgentInventorySchema = Schema.Struct({
  items: Schema.Array(ConfiguredAgentRowSchema),
  configured: Schema.Array(Schema.String),
  detected: Schema.Array(Schema.String),
  available: Schema.Array(Schema.String),
  count: Schema.Number,
});
export type ConfiguredAgentInventory = typeof ConfiguredAgentInventorySchema.Type;

export interface ListConfiguredAgentsRequest {
  /** Report only the agents detection found. */
  readonly detected?: boolean;
  /** Report every supported agent id, configured or not. */
  readonly available?: boolean;
}

/**
 * Report configured, detected, and available coding agents.
 *
 * The default view answers "what is in play here": the agents this workspace
 * configures and the ones present on the machine. `universal` is materialized
 * for every workspace and is never reported as a membership choice.
 */
export const listConfiguredAgents = (
  request: ListConfiguredAgentsRequest = {},
): Effect.Effect<
  ConfiguredAgentInventory,
  ConfigureAgentsFailure,
  WorkspaceMutations | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const configured = yield* workspace.getConfiguredAgents();
    const detected = yield* detectAgentsForScope(workspace.baseDir, workspace.scope).pipe(
      Effect.map((agents) => agents.map((agent) => agent.id)),
    );
    const configuredSet = new Set(configured);
    const detectedSet = new Set(detected);
    const instructionsConfig = yield* workspace.getInstructionsConfig();
    const instructionHealth =
      Option.isSome(instructionsConfig) && instructionsConfig.value !== false
        ? yield* observeInstructionProjection({
            workspaceRoot: workspace.baseDir,
            scope: workspace.scope,
            configuredAgents: configured,
            config: resolveInstructionsConfig(instructionsConfig.value),
          }).pipe(
            Effect.map(
              ({ status }) => new Map(status.items.map((item) => [item.agentId, item.health])),
            ),
          )
        : new Map<string, string>();

    const baseIds =
      request.available === true || request.detected === true
        ? CONFIGURABLE_AGENT_IDS
        : CONFIGURABLE_AGENT_IDS.filter((id) => configuredSet.has(id) || detectedSet.has(id));

    const items = baseIds
      .filter((id) => request.detected !== true || detectedSet.has(id))
      .map((id): ConfiguredAgentRow => ({
        id,
        name: AGENTS[id].name,
        configured: configuredSet.has(id),
        detected: detectedSet.has(id),
        instructions: configuredSet.has(id) ? (instructionHealth.get(id) ?? "manual") : "-",
        lifecycle: agentLifecycle(id).state,
      }));

    return {
      items,
      configured: configured.filter((id) => id !== UNIVERSAL_AGENT_ID),
      detected,
      available: [...CONFIGURABLE_AGENT_IDS],
      count: items.length,
    } satisfies ConfiguredAgentInventory;
  });

/** The configured-agent membership use case. */
export const ConfigureAgents = {
  add: {
    prepare: prepareAddConfiguredAgents,
    previewOrApply: previewOrApplyAddConfiguredAgents,
  },
  remove: {
    prepare: prepareRemoveConfiguredAgents,
    previewOrApply: previewOrApplyRemoveConfiguredAgents,
  },
  list: listConfiguredAgents,
} as const;
