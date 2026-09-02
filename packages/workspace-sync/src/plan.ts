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
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import type * as ServiceMap from "effect/Context";
import {
  CodingAgentRepository,
  HookManager,
  KnowledgeManager,
  RuleManager,
  applyPlannedProjections,
  inspectMcpServerAcrossAgents,
  observeInstructionProjection,
  projectionFactRequiresReconciliation,
  pruneManagedMcpServersForAgent,
  resolveInstructionsConfig,
  syncInlineMcpServerToAgents,
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  instructionProjectionEffects,
  instructionProjectionIsCurrent,
  type ProjectionInvariantFact,
} from "@agentxm/extension-workspace";
import {
  StepFailure,
  type Job,
  type JobStepArtifact,
  type JobStepResult,
  type OperationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import type { ReleaseAgeOperationEvidence } from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import { WorkspaceMutations, type McpServerEntry } from "@agentxm/workspace-state";
import { reconcileAgentOutputs } from "./rendered-file-cleanup.js";
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

/** Services the feature's own plan steps require at execution time. */
export type SyncStepRequirements =
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository;

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
  const contributors = Array.from(
    new Set(violations.flatMap(({ affectedContributors }) => affectedContributors)),
  );
  const details = contributors.length === 0 ? statuses : `${statuses}: ${contributors.join(", ")}`;
  return details.length === 0 ? label : `${label} (${details})`;
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

export const collectKnowledgeStep = Effect.fn("Sync.collectKnowledgeStep")(function* (args: {
  readonly adapter: SyncFailureAdapter;
  readonly deferPreview?: boolean;
  readonly facts?: ReadonlyArray<ProjectionInvariantFact>;
}) {
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
    label: "Knowledge discovery",
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

export const collectCleanupStep = Effect.fn("Sync.collectCleanupStep")(function* (args: {
  readonly expectedSkillNames: ReadonlySet<string>;
  readonly expectedSubagentNames: ReadonlySet<string>;
  readonly expectedMcpServerNames: ReadonlySet<string>;
  readonly expectedHookNames: ReadonlySet<string>;
  readonly adapter: SyncFailureAdapter;
}) {
  const ws = yield* WorkspaceMutations;
  const agentRepo = yield* CodingAgentRepository;
  const desiredAgentIds = new Set(
    (yield* agentRepo.getMaterializationAgents()).map(({ id }) => id),
  );
  const expectedSkillProjectionNames = new Set([
    ...args.expectedSkillNames,
    ...args.expectedSubagentNames,
  ]);
  const expectedNames = {
    skill: expectedSkillProjectionNames,
    subagent: args.expectedSubagentNames,
    "mcp-server": args.expectedMcpServerNames,
    hook: args.expectedHookNames,
  } as const;
  const preview = yield* reconcileAgentOutputs({
    desiredAgentIds,
    expectedNames,
    dryRun: true,
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
    run: reconcileAgentOutputs({ desiredAgentIds, expectedNames }).pipe(
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
}) {
  const facts = args.facts;
  const manager = yield* HookManager;
  const ws = yield* WorkspaceMutations;
  if (!projectionFactsNeedReconciliation(facts))
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
    manager.configuredAgentOutcomes === undefined
      ? []
      : yield* manager.configuredAgentOutcomes("projected");
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
      yield* applyPlannedProjections(manager);
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
  materializeSteps,
  knowledgeStep,
  hooksStep,
  cleanupStep,
  instructionStep,
  releaseAge,
  serialMaterialization = false,
  name = SYNC_PLAN_NAME,
  description = SYNC_PLAN_DESCRIPTION,
}: {
  readonly materializeSteps: ReadonlyArray<PlannedJobStep<R>>;
  readonly knowledgeStep: Option.Option<PlannedJobStep<R>>;
  readonly hooksStep: Option.Option<PlannedJobStep<R>>;
  readonly cleanupStep: Option.Option<PlannedJobStep<R>>;
  readonly instructionStep: Option.Option<PlannedJobStep<R>>;
  readonly releaseAge: ReleaseAgeOperationEvidence;
  readonly serialMaterialization?: boolean;
  readonly name?: string;
  readonly description?: string;
}): Plan<R> => {
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
  return {
    _tag: "Plan",
    name,
    description: Option.some(description),
    jobs,
    releaseAge,
    presentation: SYNC_PRESENTATION,
  };
};
