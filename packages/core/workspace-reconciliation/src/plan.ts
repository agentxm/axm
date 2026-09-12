/**
 * Sync plan policy: recovery identities, aggregate-unit reconciliation steps
 * (knowledge discovery, managed hook projections, instruction files, stale
 * managed-projection cleanup, inline MCP servers and managed-entry pruning),
 * and the plan-assembly ordering that realizes desired state. The CLI keeps
 * argument parsing, confirmation, rendering, and plan execution.
 *
 * The application supplies a {@link SyncFailureAdapter}: its boundary mapping
 * from typed failures to the kernel's `StepFailure`, so step categories and
 * details stay byte-identical with the boundary's own rendering.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import type * as ServiceMap from "effect/Context";
import {
  HookManager,
  KnowledgeManager,
  RuleManager,
  type PreparedHookProjection,
} from "@agentxm/extension-materialization";
import {
  CodingAgentRepository,
  applyPlannedProjections,
  applyProjectionPlans,
  inspectMcpServerAcrossAgents,
  observeInstructionProjection,
  projectionFactRequiresReconciliation,
  resolveInstructionsConfig,
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  instructionProjectionEffects,
  instructionProjectionIsCurrent,
  expectedProjectionNamesOf,
  type ProjectionInvariantFact,
} from "@agentxm/workspace-projection";
import {
  pruneManagedMcpServersForAgent,
  syncInlineMcpServerToAgents,
  type NativeWriteAuthority,
} from "@agentxm/agent-integration";
import type { ManagerRequirements } from "@agentxm/extension-materialization";
import type { RecipeRequirements } from "./extensions/operations.js";
import {
  StepFailure,
  type Job,
  type JobStepArtifact,
  type JobStepResult,
  type OperationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import type { ReleaseAgeOperationEvidence } from "@agentxm/extension-resolution";
import type { WorkspaceTransactionScope } from "@agentxm/workspace-transactions";
import {
  WorkspaceMutations,
  type DesiredStateGraph,
  type McpServerEntry,
  type WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-state";
import { buildReconciliationClosure } from "./closure.js";
import { reconcileAgentOutputs } from "./rendered-file-cleanup.js";
import type { WorkspaceSyncCleanupFailure } from "./errors.js";
import type { SyncFailureAdapter } from "./failure-adapter.js";

export const SYNC_RECOVERY_IDS = {
  packManifestDivergence: "pack:manifest-divergence",
  extensionConstraintMismatch: "extension:constraint-mismatch",
  inlineMcpCollision: "mcp-server:inline",
  hookProjections: "hook:projections",
  instructionReconcile: "instruction:reconcile",
} as const;

/** Executable sync recovery and blocker identities covered by recovery conformance. */
export const syncRecoveryIdentifiers = [
  SYNC_RECOVERY_IDS.packManifestDivergence,
  SYNC_RECOVERY_IDS.extensionConstraintMismatch,
  SYNC_RECOVERY_IDS.inlineMcpCollision,
  SYNC_RECOVERY_IDS.hookProjections,
  SYNC_RECOVERY_IDS.instructionReconcile,
] as const;

export const SYNC_PLAN_NAME = "Sync workspace";
export const SYNC_PLAN_DESCRIPTION =
  "Workspace-wide materialization from settings and on-disk extension content";
export const SYNC_PRESENTATION: OperationPresentation = {
  verb: { imperative: "sync", past: "Synced", gerund: "Syncing" },
  subject: { singular: "workspace item", plural: "workspace items" },
};

/**
 * Services the feature's own plan steps require at execution time: the
 * workspace facade and agent repository the selection reads, plus everything a
 * materialization manager and the transaction its closure opens declare.
 */
export type SyncStepRequirements =
  ManagerRequirements | RecipeRequirements | WorkspaceMutations | CodingAgentRepository;

// Deliberately duplicated from the CLI-destined renderer helper: a feature
// package may not depend on application presentation utilities, and this
// pluralizer is within the sanctioned duplication budget for small pure
// functions.
const count = (n: number, singular: string, plural?: string): string =>
  `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;

// -----------------------------------------------------------------------------
// Projection-fact queries
// -----------------------------------------------------------------------------

export const projectionFactsNeedReconciliation = (
  facts: ReadonlyArray<ProjectionInvariantFact>,
): boolean => facts.some(projectionFactRequiresReconciliation);

export const projectionDivergenceLabel = (
  label: string,
  facts: ReadonlyArray<ProjectionInvariantFact>,
): string => {
  const violations = facts.filter(projectionFactRequiresReconciliation);
  const statuses = Array.from(
    new Set(violations.map(({ observation }) => observation.status)),
  ).join(", ");
  return statuses.length === 0 ? label : `${label} (${statuses})`;
};

const managedRegionsForFacts = (facts: ReadonlyArray<ProjectionInvariantFact>) =>
  facts.flatMap(({ subject }) =>
    subject.owner === undefined
      ? []
      : [{ unitId: subject.unitId, path: subject.path, owner: subject.owner }],
  );

const projectionFileTargets = (
  facts: ReadonlyArray<ProjectionInvariantFact>,
): ReadonlyArray<{ readonly path: string; readonly change: "updated" }> =>
  facts
    .filter(projectionFactRequiresReconciliation)
    .map(({ subject }) => ({
      path: subject.path.split("#", 1)[0] ?? subject.path,
      change: "updated" as const,
    }))
    .filter(
      (target, index, targets) =>
        targets.findIndex((candidate) => candidate.path === target.path) === index,
    );

const mergeArtifactTargets = (
  targets: ReadonlyArray<{
    readonly path: string;
    readonly change: "created" | "updated" | "removed";
  }>,
) => {
  const byPath = new Map<string, (typeof targets)[number]>();
  for (const target of targets) byPath.set(target.path, target);
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
};

// -----------------------------------------------------------------------------
// MCP-server projection steps
// -----------------------------------------------------------------------------

export const isInlineMcpServerEntry = (entry: McpServerEntry): boolean => entry.kind === "inline";

export const buildInlineMcpServerSyncOperation = ({
  name,
  entry,
  agentIds,
  force,
  ws,
  adapter,
}: {
  readonly name: string;
  readonly entry: McpServerEntry;
  readonly agentIds: ReadonlyArray<string>;
  readonly force: boolean;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
  readonly adapter: SyncFailureAdapter;
}): PlannedJobStep<SyncStepRequirements> => ({
  key: `mcp-server:inline:${name}`,
  label: `mcp-server ${name}`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const inspections = yield* inspectMcpServerAcrossAgents({
      workspaceRoot: ws.baseDir,
      scope: ws.scope,
      agentIds,
      serverName: name,
      entry,
    });
    const inspectionWarnings = inspections.flatMap((inspection) =>
      inspection.status === "drift" || inspection.status === "unmanaged"
        ? [
            `${inspection.agentId}: ${inspection.status}${
              inspection.fields.length > 0 ? ` (${inspection.fields.join(", ")})` : ""
            }`,
          ]
        : [],
    );
    const hasUnownedCollision = inspections.some((inspection) => inspection.status === "unmanaged");
    if (hasUnownedCollision && !force) {
      return {
        result: "error",
        message: `Inline MCP server ${name} collides with unowned native config; move, remove, or adopt the unowned entry before rerunning axm sync`,
        error: new StepFailure({
          category: "conflict",
          detail: `Inline MCP server ${name} collides with unowned native config`,
        }),
      } satisfies JobStepResult;
    }
    const batchOutcomes = yield* syncInlineMcpServerToAgents(agentIds, {
      workspaceRoot: ws.baseDir,
      serverName: name,
      entry,
      scope: ws.scope,
    });
    const outcomes = agentIds.flatMap((agentId, index) => {
      const outcome = batchOutcomes[index];
      return outcome === undefined ? [] : [{ agentId, outcome }];
    });
    const warningDetails = outcomes.flatMap(({ agentId, outcome }) => {
      if (outcome._tag === "success") {
        return (outcome.warnings ?? []).map((warning) => `${agentId}: ${warning}`);
      }
      return [`${agentId}: ${outcome.reason}`];
    });
    const warnings = [...inspectionWarnings, ...warningDetails];
    return {
      result: "success",
      message:
        warnings.length === 0
          ? `Synced inline MCP server ${name}`
          : `Synced inline MCP server ${name} with ${count(warnings.length, "warning")}`,
      ...(warnings.length > 0 ? { warnings } : {}),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(adapter.toStepFailure)),
});

export const buildMcpServerPruneOperation = ({
  declaredServerNames,
  agentIds,
  ws,
  adapter,
}: {
  readonly declaredServerNames: ReadonlySet<string>;
  readonly agentIds: ReadonlyArray<string>;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
  readonly adapter: SyncFailureAdapter;
}): PlannedJobStep<SyncStepRequirements> => ({
  key: "mcp-server:prune",
  label: "mcp-server stale managed entries",
  readiness: "ready",
  run: Effect.forEach(
    agentIds,
    (agentId) =>
      pruneManagedMcpServersForAgent(agentId, {
        workspaceRoot: ws.baseDir,
        declaredServerNames,
        scope: ws.scope,
      }).pipe(Effect.map((outcome) => ({ agentId, outcome }))),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map((outcomes) => {
      const warnings = outcomes.filter(({ outcome }) => outcome._tag !== "success");
      return {
        result: "success",
        message:
          warnings.length === 0
            ? "Pruned stale managed MCP server entries"
            : `Pruned stale managed MCP server entries with ${count(warnings.length, "warning")}`,
      } satisfies JobStepResult;
    }),
    Effect.mapError(adapter.toStepFailure),
  ),
});

// -----------------------------------------------------------------------------
// Aggregate-unit reconciliation steps
// -----------------------------------------------------------------------------

/**
 * The Knowledge discovery reconciliation step, or nothing when discovery is
 * already current.
 *
 * The signature is declared rather than inferred: the step this returns is a
 * `PlannedJobStep`, and letting the emitter infer it would publish the object
 * literal's structure and expand the manager failure union into every package
 * that contributes to it — including packages this one does not declare.
 */
export const collectKnowledgeStep: (args: {
  readonly adapter: SyncFailureAdapter;
  readonly deferPreview?: boolean;
  readonly facts?: ReadonlyArray<ProjectionInvariantFact>;
}) => Effect.Effect<
  Option.Option<PlannedJobStep<SyncStepRequirements>>,
  WorkspaceSettingsReadFailure,
  WorkspaceMutations | ManagerRequirements | WorkspaceTransactionScope | KnowledgeManager
> = Effect.fn("Sync.collectKnowledgeStep")(function* (args) {
  const manager = yield* KnowledgeManager;
  const ws = yield* WorkspaceMutations;
  const instructions = yield* ws.getInstructionsConfig();
  const instructionFile = resolveInstructionsConfig(
    Option.isSome(instructions) && instructions.value !== false ? instructions.value : undefined,
  ).fileName;
  const previewResult =
    args.deferPreview === true ? undefined : yield* Effect.result(manager.sync({ dryRun: true }));
  if (previewResult !== undefined && Result.isFailure(previewResult)) {
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: "knowledge:discovery",
      label: "Knowledge discovery",
      readiness: "error",
      errorMessage: args.adapter.toStepFailure(previewResult.failure).detail,
      artifact: {
        path: instructionFile,
        scope: ws.scope,
        change: "unchanged",
        managedRegions: managedRegionsForFacts(args.facts ?? []),
      },
    });
  }
  const preview = previewResult === undefined ? undefined : previewResult.success;
  if (preview !== undefined && !preview.changed && preview.warnings.length === 0) {
    return Option.none<PlannedJobStep<SyncStepRequirements>>();
  }
  const details =
    preview?.artifacts
      .filter((artifact) => artifact.change !== "unchanged")
      .map(
        (artifact) =>
          `${artifact.change} ${artifact.path}${artifact.mechanism === undefined ? "" : ` (${artifact.mechanism})`}`,
      ) ?? [];
  const message = [...details, ...(preview?.warnings ?? [])].join("; ");
  const artifact = {
    path: instructionFile,
    scope: ws.scope,
    change: preview?.changed === false ? "unchanged" : "updated",
    managedRegions: managedRegionsForFacts(args.facts ?? []),
  } satisfies JobStepArtifact;
  return Option.some({
    key: "knowledge:discovery",
    label: projectionDivergenceLabel("Knowledge discovery", args.facts ?? []),
    readiness: "ready",
    artifact,
    ...(message.length === 0 ? {} : { message }),
    run: manager.sync({ dryRun: false }).pipe(
      Effect.mapError(args.adapter.toStepFailure),
      Effect.map((result): JobStepResult => {
        const mechanism = result.artifacts.find(
          (artifact) => artifact.mechanism !== undefined,
        )?.mechanism;
        return {
          result: "success",
          message: result.changed
            ? "Reconciled Knowledge discovery"
            : "Knowledge discovery already current",
          ...(result.warnings.length === 0 ? {} : { warnings: result.warnings }),
          artifact: {
            ...artifact,
            change: result.changed ? "updated" : "unchanged",
            ...(mechanism === undefined ? {} : { mechanism }),
            targets: result.artifacts.map((artifact) => ({
              path: artifact.path,
              change: artifact.change,
            })),
          },
        };
      }),
    ),
  } satisfies PlannedJobStep<SyncStepRequirements>);
});

/**
 * The stale-managed-projection cleanup step, or nothing when the sweep found
 * no owned residue. The failure channel is named: the cleanup sweep's own
 * union, not the expansion of every family that feeds it.
 */
export const collectCleanupStep: (args: {
  readonly expectedSkillNames: ReadonlySet<string>;
  readonly expectedSubagentNames: ReadonlySet<string>;
  readonly expectedMcpServerNames: ReadonlySet<string>;
  readonly expectedHookNames: ReadonlySet<string>;
  readonly adapter: SyncFailureAdapter;
  readonly subjects?: ReadonlyArray<{ readonly type: string; readonly name: string }>;
}) => Effect.Effect<
  Option.Option<PlannedJobStep<SyncStepRequirements>>,
  WorkspaceSyncCleanupFailure,
  | CodingAgentRepository
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
  | NativeWriteAuthority
> = Effect.fn("Sync.collectCleanupStep")(function* (args) {
  const ws = yield* WorkspaceMutations;
  const agentRepo = yield* CodingAgentRepository;
  const desiredAgentIds = new Set(
    (yield* agentRepo.getMaterializationAgents()).map(({ id }) => id),
  );
  const expectedNames = expectedProjectionNamesOf({
    skill: args.expectedSkillNames,
    subagent: args.expectedSubagentNames,
    mcpServer: args.expectedMcpServerNames,
    hook: args.expectedHookNames,
  });
  const preview = yield* reconcileAgentOutputs({
    desiredAgentIds,
    expectedNames,
    dryRun: true,
    ...(args.subjects === undefined ? {} : { subjects: args.subjects }),
  });
  const previewPaths = preview.removedPaths;
  if (previewPaths.length === 0) return Option.none<PlannedJobStep<SyncStepRequirements>>();
  return Option.some<PlannedJobStep<SyncStepRequirements>>({
    key: "projection:cleanup",
    label: "stale managed agent projections",
    readiness: "ready",
    artifact: {
      path: previewPaths[0] ?? "stale managed agent projections",
      scope: ws.scope,
      change: "removed",
      fileCount: previewPaths.length,
      targets: previewPaths.map((filePath) => ({ path: filePath, change: "removed" })),
    },
    run: reconcileAgentOutputs({
      desiredAgentIds,
      expectedNames,
      ...(args.subjects === undefined ? {} : { subjects: args.subjects }),
    }).pipe(
      Effect.mapError(args.adapter.toStepFailure),
      Effect.map((result): JobStepResult => {
        const removedPaths = result.removedPaths;
        return {
          result: "success",
          message: `Removed ${count(removedPaths.length, "stale managed agent projection")}`,
          artifact: {
            path: removedPaths[0] ?? previewPaths[0] ?? "stale managed agent projections",
            scope: ws.scope,
            change: "removed",
            fileCount: removedPaths.length,
            targets: removedPaths.map((filePath) => ({ path: filePath, change: "removed" })),
          },
        };
      }),
    ),
  });
});

export const collectHooksStep = Effect.fn("Sync.collectHooksStep")(function* (args: {
  readonly facts: ReadonlyArray<ProjectionInvariantFact>;
  readonly adapter: SyncFailureAdapter;
  readonly prepared?: PreparedHookProjection;
}) {
  const facts = args.facts;
  const manager = yield* HookManager;
  const ws = yield* WorkspaceMutations;
  if (args.prepared === undefined && !projectionFactsNeedReconciliation(facts))
    return Option.none<PlannedJobStep<SyncStepRequirements>>();
  const unsupported = facts.find(
    ({ observation }) => observation.reasonCode === "unsupported-version",
  );
  if (unsupported !== undefined) {
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: SYNC_RECOVERY_IDS.hookProjections,
      label: "managed hook projections",
      readiness: "error",
      errorMessage:
        unsupported.observation.message ??
        "Managed hook projection uses an unsupported marker version; upgrade AXM.",
      artifact: {
        path: "managed hook projections",
        scope: ws.scope,
        change: "unchanged",
        managedRegions: managedRegionsForFacts(facts),
      },
    });
  }
  const agentOutcomes =
    args.prepared?.agentOutcomes ??
    (manager.configuredAgentOutcomes === undefined
      ? []
      : yield* manager.configuredAgentOutcomes("projected"));
  const artifact = {
    path: "managed hook projections",
    scope: ws.scope,
    change: "updated",
    agentOutcomes,
    managedRegions: managedRegionsForFacts(facts),
  } satisfies JobStepArtifact;
  const blocked = agentOutcomes.filter(({ outcome }) => outcome === "blocked");
  if (blocked.length > 0) {
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: SYNC_RECOVERY_IDS.hookProjections,
      label: projectionDivergenceLabel("managed hook projections", facts),
      readiness: "error",
      errorMessage: blocked
        .map(({ name, agentId, reason }) => `${name} for ${agentId}: ${reason}`)
        .join("; "),
      artifact,
    });
  }
  return Option.some<PlannedJobStep<SyncStepRequirements>>({
    key: SYNC_RECOVERY_IDS.hookProjections,
    label: projectionDivergenceLabel("managed hook projections", facts),
    readiness: "ready",
    artifact,
    run: Effect.gen(function* () {
      if (args.prepared === undefined) yield* applyPlannedProjections(manager);
      else yield* applyProjectionPlans(args.prepared.plans);
      const currentOutcomes =
        manager.configuredAgentOutcomes === undefined
          ? []
          : yield* manager.configuredAgentOutcomes("current");
      return {
        result: "success",
        message: "Reconciled managed hook entries and the fallback region",
        artifact: { ...artifact, agentOutcomes: currentOutcomes },
      } satisfies JobStepResult;
    }).pipe(Effect.mapError(args.adapter.toStepFailure)),
  });
});

export const collectInstructionStep = Effect.fn("Sync.collectInstructionStep")(function* (args: {
  readonly projectionFacts: ReadonlyArray<ProjectionInvariantFact>;
  readonly adapter: SyncFailureAdapter;
}) {
  const projectionFacts = args.projectionFacts;
  const ws = yield* WorkspaceMutations;
  const config = yield* ws.getInstructionsConfig();
  const manager = yield* RuleManager;
  const unsupported = projectionFacts.find(
    ({ observation }) => observation.reasonCode === "unsupported-version",
  );
  if (unsupported !== undefined) {
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: SYNC_RECOVERY_IDS.instructionReconcile,
      readiness: "error",
      label: "instruction files",
      errorMessage:
        unsupported.observation.message ??
        "Instruction projection uses an unsupported marker version; upgrade AXM.",
      artifact: {
        path: unsupported.subject.path.split("#", 1)[0] ?? unsupported.subject.path,
        scope: ws.scope,
        change: "unchanged",
        managedRegions: managedRegionsForFacts(projectionFacts),
      },
    });
  }
  if (Option.isNone(config) || config.value === false) {
    if (!projectionFactsNeedReconciliation(projectionFacts))
      return Option.none<PlannedJobStep<SyncStepRequirements>>();
    const targets = projectionFileTargets(projectionFacts);
    const artifact = {
      path: targets[0]?.path ?? "managed Rules region",
      scope: ws.scope,
      change: targets[0]?.change ?? "updated",
      targets,
      managedRegions: managedRegionsForFacts(projectionFacts),
    } satisfies JobStepArtifact;
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: SYNC_RECOVERY_IDS.instructionReconcile,
      readiness: "ready",
      label: projectionDivergenceLabel("managed Rules region", projectionFacts),
      artifact,
      run: applyPlannedProjections(manager).pipe(
        Effect.mapError(args.adapter.toStepFailure),
        Effect.as({
          result: "success",
          message: "Reconciled the managed Rules region",
          artifact,
        } satisfies JobStepResult),
      ),
    });
  }

  const configuredAgents = yield* ws.getConfiguredAgents();
  const resolvedConfig = resolveInstructionsConfig(config.value);
  const snapshot = yield* observeInstructionProjection({
    workspaceRoot: ws.baseDir,
    scope: ws.scope,
    configuredAgents,
    config: resolvedConfig,
  });
  const path = yield* Path.Path;
  const regionCurrent = !projectionFactsNeedReconciliation(projectionFacts);
  const current =
    snapshot.status.missingSources.length === 0 &&
    regionCurrent &&
    instructionProjectionIsCurrent(snapshot);
  if (current) return Option.none<PlannedJobStep<SyncStepRequirements>>();

  const readiness = yield* Effect.result(
    Effect.all(
      [assertInstructionTargetsSafe(snapshot.status), assertInstructionsGitignoreSafe(ws.baseDir)],
      { concurrency: 1, discard: true },
    ),
  );
  if (readiness._tag === "Failure") {
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: SYNC_RECOVERY_IDS.instructionReconcile,
      readiness: "error",
      label: "instruction files",
      errorMessage: args.adapter.toStepFailure(readiness.failure).detail,
    });
  }

  const ruleTargets = projectionFileTargets(projectionFacts);
  const instructionTargets = instructionProjectionEffects(snapshot).map((effect) => ({
    ...effect,
    path: path.relative(ws.baseDir, effect.path),
  }));
  const targets = mergeArtifactTargets([...ruleTargets, ...instructionTargets]);
  const artifact = {
    path: targets[0]?.path ?? resolvedConfig.fileName,
    scope: ws.scope,
    change: targets[0]?.change ?? "updated",
    managedRegions: managedRegionsForFacts(projectionFacts),
    targets,
  } satisfies JobStepArtifact;

  return Option.some<PlannedJobStep<SyncStepRequirements>>({
    key: SYNC_RECOVERY_IDS.instructionReconcile,
    readiness: "ready",
    label: projectionDivergenceLabel("instruction files", projectionFacts),
    artifact,
    run: applyPlannedProjections(manager).pipe(
      Effect.mapError(args.adapter.toStepFailure),
      Effect.map((): JobStepResult => ({
        result: "success",
        message: "Reconciled canonical instructions, aliases, and gitignore entries",
        artifact,
      })),
    ),
  });
});

// Rule materialization and instruction reconciliation are ordered explicitly in
// the plan so aliases are updated only after canonical content is current.

export const makeSyncPlan = <R>({
  graph,
  scope,
  adapter,
  materializeSteps,
  knowledgeStep,
  hooksStep,
  cleanupStep,
  instructionStep,
  retirementStep,
  releaseAge,
  serialMaterialization = false,
  name = SYNC_PLAN_NAME,
  description = SYNC_PLAN_DESCRIPTION,
}: {
  readonly graph: DesiredStateGraph;
  readonly scope: JobStepArtifact["scope"];
  readonly adapter: SyncFailureAdapter;
  readonly materializeSteps: ReadonlyArray<PlannedJobStep<R>>;
  readonly knowledgeStep: Option.Option<PlannedJobStep<R>>;
  readonly hooksStep: Option.Option<PlannedJobStep<R>>;
  readonly cleanupStep: Option.Option<PlannedJobStep<R>>;
  readonly instructionStep: Option.Option<PlannedJobStep<R>>;
  readonly retirementStep?: PlannedJobStep<R>;
  readonly releaseAge: ReleaseAgeOperationEvidence;
  readonly serialMaterialization?: boolean;
  readonly name?: string;
  readonly description?: string;
}) =>
  Effect.gen(function* () {
    const ruleSteps = materializeSteps.filter((step) => step.key?.startsWith("rule:") === true);
    const nonRuleSteps = materializeSteps.filter((step) => step.key?.startsWith("rule:") !== true);
    const jobs: Array<Job<R>> = [];
    if (nonRuleSteps.length > 0) {
      jobs.push({ concurrency: serialMaterialization ? 1 : "unbounded", steps: nonRuleSteps });
    }
    if (Option.isSome(knowledgeStep)) {
      jobs.push({ concurrency: 1, steps: [knowledgeStep.value] });
    }
    if (ruleSteps.length > 0) {
      jobs.push({ concurrency: "unbounded", steps: ruleSteps });
    }
    // Aggregate hook units render after canonical hook materialization.
    if (Option.isSome(hooksStep)) {
      jobs.push({ concurrency: 1, steps: [hooksStep.value] });
    }
    if (Option.isSome(cleanupStep)) {
      jobs.push({ concurrency: 1, steps: [cleanupStep.value] });
    }
    if (Option.isSome(instructionStep)) {
      jobs.push({ concurrency: 1, steps: [instructionStep.value] });
    }
    if (retirementStep !== undefined) jobs.push({ concurrency: 1, steps: [retirementStep] });
    // Storage files alone do not couple unrelated domain transitions. Dependency
    // routes and shared native units do: failure in either restores the component.
    const ordered = jobs.flatMap((job) => job.steps);
    const components: Array<{ keys: Set<string>; steps: Array<PlannedJobStep<R>> }> = [];
    const nativePath = (value: string) => value.split("#", 1)[0] ?? value;
    const aggregateKeys = (step: PlannedJobStep<R>): ReadonlyArray<string> => {
      const key = step.key ?? "";
      if (
        key.startsWith("knowledge:") ||
        key.startsWith("rule:") ||
        key.startsWith("hook:") ||
        key === "instruction:reconcile"
      )
        return ["native:instruction-contributors"];
      return [];
    };
    for (const step of ordered) {
      const keys = new Set(aggregateKeys(step));
      const key = step.key ?? "";
      for (const node of graph.nodes) {
        if (
          key !== `${node.type}:${node.name}` &&
          !(
            node.type === "pack" &&
            key === `${SYNC_RECOVERY_IDS.packManifestDivergence}:${node.name}`
          )
        )
          continue;
        keys.add(`subject:${node.type}:${node.name}`);
        if (node.type === "pack") keys.add(`pack:${node.identity.replace(/^workspace:/, "")}`);
        for (const origin of node.origins)
          if (origin.type === "pack") keys.add(`pack:${origin.pack.replace(/^workspace:/, "")}`);
      }
      for (const target of [
        ...(step.artifact?.targets ?? []),
        ...(step.artifact?.managedRegions ?? []),
      ]) {
        const file = nativePath(target.path);
        if (!file.endsWith("axm.json") && !file.endsWith("axm-lock.yaml")) keys.add(`path:${file}`);
      }
      const touching = components.filter((component) =>
        [...keys].some((key) => component.keys.has(key)),
      );
      const component = {
        keys: new Set([...keys, ...touching.flatMap((item) => [...item.keys])]),
        steps: [...touching.flatMap((item) => item.steps), step],
      };
      for (const item of touching) components.splice(components.indexOf(item), 1);
      components.push(component);
    }
    const closures = yield* Effect.forEach(components, ({ steps }) => {
      if (steps.length === 1) return Effect.succeed(steps[0]);
      // Preserve the topological order even when this step joins earlier components.
      steps.sort((left, right) => ordered.indexOf(left) - ordered.indexOf(right));
      const artifacts = steps.flatMap((step) =>
        step.artifact === undefined ? [] : [step.artifact],
      );
      return buildReconciliationClosure({
        toStepFailure: (failure) =>
          failure._tag === "StepFailure" ? failure : adapter.toStepFailure(failure),
        label: steps.map((step) => step.label).join("; "),
        message: "Reconciled dependent workspace state",
        artifact: {
          path:
            artifacts[0]?.path ?? (scope === "project" ? "axm.json" : ".axm/workspace/axm.json"),
          scope,
          change: "updated",
          targets: artifacts.flatMap((artifact) => artifact.targets ?? []),
          references: artifacts.flatMap((artifact) => artifact.references ?? []),
          managedRegions: artifacts.flatMap((artifact) => artifact.managedRegions ?? []),
        },
        children: steps.map((step) => ({ step, coverage: "ineligible" })),
        validate: Effect.void,
      });
    });
    return {
      _tag: "Plan",
      name,
      description: Option.some(description),
      jobs: [
        {
          concurrency: 1,
          executionPolicy: "best-effort",
          steps: closures.flatMap((step) => (step === undefined ? [] : [step])),
        },
      ],
      releaseAge,
      presentation: SYNC_PRESENTATION,
    } satisfies Plan<R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path>;
  });
