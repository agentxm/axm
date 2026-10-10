/**
 * Sync plan policy: recovery identities, aggregate-unit reconciliation steps
 * (knowledge discovery, managed hook projections, instruction files, stale
 * managed-projection cleanup, inline MCP servers and managed-entry pruning),
 * and the plan-assembly ordering that realizes desired state. The CLI keeps
 * argument parsing, confirmation, rendering, and plan execution.
 *
 * The application supplies a {@link StepFailureConversionService}: its boundary mapping
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
import {
  HookManager,
  KnowledgeManager,
  RuleManager,
  type PreparedHookProjection,
  type NativeProjectionOptions,
} from "../materialization/index.js";
import {
  CodingAgentRepository,
  captureAgentOutputAuthority,
  applyPlannedProjections,
  applyProjectionPlans,
  observeProjectionPlans,
  observeInstructionProjection,
  reconcileInstructionAliases,
  projectionFactRequiresReconciliation,
  resolveInstructionsConfig,
  instructionReconciliationReadiness,
  instructionProjectionEffects,
  instructionProjectionNativeLocations,
  instructionProjectionIsCurrent,
  type ExpectedProjectionNames,
  type ProjectionInvariantFact,
} from "../projection/index.js";
import { syncInlineMcpServerToAgents, type NativeWriteAuthority } from "../agent-adapters/index.js";
import type { ManagerRequirements } from "../materialization/index.js";
import type { RecipeRequirements } from "./extensions/operations.js";
import {
  type Job,
  type StepFailure,
  type JobStepArtifact,
  type JobStepResult,
  type OperationPresentation,
  type Plan,
  type PlannedJobStep,
  type ReleaseAgeOperationEvidence,
} from "../operations/index.js";
import { runWorkspaceTransaction, type WorkspaceTransactionScope } from "../settlement/index.js";
import {
  SettingsReader,
  AcceptedResolutionWriter,
  retainedPackageKeyForRef,
  DesiredStateReader,
  ConfiguredAgentOutcomesProvider,
  WorkspaceRecords,
  WorkspaceLocation,
  settingsDisplayPath,
  type WorkspaceLocationService,
  type DesiredStateGraph,
  type McpServerEntry,
  type WorkspaceSettingsReadFailure,
} from "../workspace-state/index.js";
import { buildReconciliationClosure } from "./closure.js";
import {
  captureNativeOutputRetention,
  captureRequiredNativeOutputs,
  validateNativeOutputPostconditions,
} from "./native-output-postconditions.js";
import type { NativeRetentionWitness } from "../projection/index.js";
import { reconcileAgentOutputs } from "./rendered-file-cleanup.js";
import { WorkspaceSyncFailed, type WorkspaceSyncCleanupFailure } from "./errors.js";
import type { StepFailureConversionService } from "./step-failure-conversion.js";
import {
  combineNativeLocationOutcomes,
  resolveNativeEntry,
  type NativeLocationOutcome,
} from "../locations/index.js";
import {
  desiredMcpSourceKey,
  desiredPackageKey,
  isSourcedDesiredExtension,
} from "../workspace-state/index.js";

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
 * workspace state ports and agent repository the selection reads, plus
 * everything a materialization manager and the transaction its closure opens
 * declare.
 */
export type SyncStepRequirements =
  | ManagerRequirements
  | RecipeRequirements
  | SettingsReader
  | WorkspaceLocation
  | CodingAgentRepository
  | ConfiguredAgentOutcomesProvider
  | WorkspaceRecords;

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

/**
 * Realize one inline server on every configured agent. Whether the write is
 * compatible, and what drifted, was decided when the plan was assembled;
 * shared-reader conflicts block the plan and drift facts arrive as
 * `inspectionWarnings`, so this step only writes.
 */
export const buildInlineMcpServerSyncOperation = ({
  name,
  entry,
  agentIds,
  inspectionWarnings,
  nativeLocations,
  location,
  adapter,
}: {
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
  readonly name: string;
  readonly entry: McpServerEntry;
  readonly agentIds: ReadonlyArray<string>;
  /** What the planning inspection found wrong, per agent. */
  readonly inspectionWarnings: ReadonlyArray<string>;
  readonly location: WorkspaceLocationService;
  readonly adapter: StepFailureConversionService;
}): PlannedJobStep<SyncStepRequirements> => ({
  key: `mcp-server:inline:${name}`,
  label: `mcp-server ${name}`,
  readiness: "ready",
  artifact: {
    path: nativeLocations[0]?.address.path ?? name,
    scope: location.scope,
    change: "updated",
    nativeLocations,
  },
  run: Effect.gen(function* () {
    const batchOutcomes = yield* syncInlineMcpServerToAgents(agentIds, {
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      workspaceRoot: location.baseDir,
      serverName: name,

      entry,
      scope: location.scope,
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
    const nativeLocations = combineNativeLocationOutcomes(
      batchOutcomes.flatMap((outcome) =>
        "targets" in outcome
          ? (outcome.targets ?? []).flatMap((target) =>
              target.nativeLocation === undefined ? [] : [target.nativeLocation],
            )
          : [],
      ),
    );
    const firstNative = nativeLocations[0];
    return {
      result: "success",
      message:
        warnings.length === 0
          ? `Synced inline MCP server ${name}`
          : `Synced inline MCP server ${name} with ${count(warnings.length, "warning")}`,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(firstNative === undefined
        ? {}
        : {
            artifact: {
              path: firstNative.address.path,
              scope: location.scope,
              change: "updated" as const,
              nativeLocations,
            },
          }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(adapter.toStepFailure)),
});

export const collectKnowledgeStep: (args: {
  readonly nativeProjection?: NativeProjectionOptions;
  readonly adapter: StepFailureConversionService;
  readonly deferPreview?: boolean;
  readonly facts?: ReadonlyArray<ProjectionInvariantFact>;
}) => Effect.Effect<
  Option.Option<PlannedJobStep<SyncStepRequirements>>,
  WorkspaceSettingsReadFailure,
  | SettingsReader
  | WorkspaceLocation
  | ManagerRequirements
  | WorkspaceTransactionScope
  | KnowledgeManager
> = Effect.fn("Sync.collectKnowledgeStep")(function* (args) {
  const manager = yield* KnowledgeManager;
  const settings = yield* SettingsReader;
  const location = yield* WorkspaceLocation;
  const instructions = yield* settings.instructionsConfig;
  const instructionFile = resolveInstructionsConfig(
    Option.isSome(instructions) && instructions.value !== false ? instructions.value : undefined,
  ).fileName;
  const previewResult =
    args.deferPreview === true
      ? undefined
      : yield* Effect.result(
          manager.sync({
            dryRun: true,
            ...(args.nativeProjection === undefined
              ? {}
              : { nativeProjection: args.nativeProjection }),
          }),
        );
  if (previewResult !== undefined && Result.isFailure(previewResult)) {
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: "knowledge:discovery",
      label: "Knowledge discovery",
      readiness: "error",
      errorMessage: args.adapter.toStepFailure(previewResult.failure).detail,
      artifact: {
        path: instructionFile,
        scope: location.scope,
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
    scope: location.scope,
    change: preview?.changed === false ? "unchanged" : "updated",
    managedRegions: managedRegionsForFacts(args.facts ?? []),
    nativeLocations: combineNativeLocationOutcomes([
      ...(preview?.nativeLocations ?? []),
      ...(args.facts ?? []).flatMap((fact) => fact.observation.nativeLocations ?? []),
    ]),
  } satisfies JobStepArtifact;
  return Option.some({
    key: "knowledge:discovery",
    label: projectionDivergenceLabel("Knowledge discovery", args.facts ?? []),
    readiness: "ready",
    artifact,
    ...(message.length === 0 ? {} : { message }),
    run: manager
      .sync({
        dryRun: false,
        ...(args.nativeProjection === undefined ? {} : { nativeProjection: args.nativeProjection }),
      })
      .pipe(
        Effect.flatMap((result) =>
          Effect.map(manager.aggregateProjectionObservation, (observation) => ({
            result,
            observation,
          })),
        ),
        Effect.mapError(args.adapter.toStepFailure),
        Effect.map(({ result, observation }): JobStepResult => {
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
              ...(observation.nativeLocations === undefined
                ? {}
                : { nativeLocations: observation.nativeLocations }),
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
 *
 * The agents whose outputs stay are the workspace's materialization agents
 * unless the caller names the set itself: a membership change that removes
 * an agent reconciles against the membership the workspace holds once the
 * change settles, which is not yet what the repository reports.
 */
export const collectCleanupStep: (args: {
  readonly expectedNames: ExpectedProjectionNames;
  readonly desiredAgentIds?: ReadonlySet<string>;
  readonly adapter: StepFailureConversionService;
  readonly subjects?: ReadonlyArray<{ readonly type: string; readonly name: string }>;
}) => Effect.Effect<
  Option.Option<PlannedJobStep<SyncStepRequirements>>,
  WorkspaceSyncCleanupFailure,
  | CodingAgentRepository
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | DesiredStateReader
  | NativeWriteAuthority
  | ConfiguredAgentOutcomesProvider
  | WorkspaceRecords
> = Effect.fn("Sync.collectCleanupStep")(function* (args) {
  const location = yield* WorkspaceLocation;
  const agentRepo = yield* CodingAgentRepository;
  const desiredAgentIds =
    args.desiredAgentIds ??
    new Set((yield* agentRepo.getMaterializationAgents()).map(({ id }) => id));
  const authority = yield* captureAgentOutputAuthority().pipe(
    Effect.mapError(
      (cause) =>
        new WorkspaceSyncFailed({
          category: "internal",
          detail: "Cannot establish native output ownership",
          cause,
        }),
    ),
  );
  const preview = yield* reconcileAgentOutputs({
    authority,
    desiredAgentIds,
    expectedNames: args.expectedNames,
    dryRun: true,
    ...(args.subjects === undefined ? {} : { subjects: args.subjects }),
  });
  const retainedNativeLocations = Effect.gen(function* () {
    if (args.desiredAgentIds === undefined) return [];
    const graph = yield* (yield* DesiredStateReader).graph();
    const subjects = graph.nodes.filter(
      (node) =>
        node.enabled &&
        node.type !== "pack" &&
        (args.subjects === undefined ||
          args.subjects.some(
            (subject) => subject.type === node.type && subject.name === node.name,
          )),
    );
    const required = yield* captureRequiredNativeOutputs(subjects, {
      configuredAgents: [...desiredAgentIds],
      planned: preview.nativeLocations ?? [],
    });
    return required.map((unit): NativeLocationOutcome =>
      unit.state !== "unchanged"
        ? unit
        : {
            ...unit,
            state: "retained",
            reason:
              unit.configuredConsumers.length > 0
                ? `Still required by configured consumers: ${unit.configuredConsumers.join(", ")}.`
                : "Still required by AXM's shared skills policy; no configured agents read this location.",
          },
    );
  }).pipe(
    Effect.mapError(
      (cause) =>
        new WorkspaceSyncFailed({
          category: "conflict",
          detail: "Cannot verify retained native outputs",
          cause,
        }),
    ),
  );
  const previewNativeLocations = combineNativeLocationOutcomes([
    ...(preview.nativeLocations ?? []),
    ...(yield* retainedNativeLocations),
  ]);
  const previewPaths = preview.removedPaths;
  if (
    previewPaths.length === 0 &&
    args.desiredAgentIds === undefined &&
    args.subjects === undefined
  )
    return Option.none<PlannedJobStep<SyncStepRequirements>>();
  if (previewPaths.length === 0 && previewNativeLocations.length === 0)
    return Option.none<PlannedJobStep<SyncStepRequirements>>();
  return Option.some<PlannedJobStep<SyncStepRequirements>>({
    key: "projection:cleanup",
    label: "stale managed agent projections",
    readiness: "ready",
    artifact: {
      path: previewPaths[0] ?? "stale managed agent projections",
      scope: location.scope,
      change: previewPaths.length === 0 ? "unchanged" : "removed",
      fileCount: previewPaths.length,
      nativeLocations: previewNativeLocations,
      targets: previewPaths.map((filePath) => ({ path: filePath, change: "removed" })),
    },
    run: reconcileAgentOutputs({
      authority,
      desiredAgentIds,
      expectedNames: args.expectedNames,
      ...(args.subjects === undefined ? {} : { subjects: args.subjects }),
    }).pipe(
      Effect.flatMap((result) =>
        retainedNativeLocations.pipe(
          Effect.map((retained) => ({
            ...result,
            nativeLocations: combineNativeLocationOutcomes([
              ...(result.nativeLocations ?? []),
              ...retained,
            ]),
          })),
        ),
      ),
      Effect.mapError(args.adapter.toStepFailure),
      Effect.map((result): JobStepResult => {
        const removedPaths = result.removedPaths;
        return {
          result: "success",
          message:
            removedPaths.length === 0
              ? "Retained native entries required by remaining consumers or policy"
              : `Removed ${count(removedPaths.length, "stale managed agent projection")}`,
          artifact: {
            path: removedPaths[0] ?? previewPaths[0] ?? "stale managed agent projections",
            scope: location.scope,
            change: removedPaths.length === 0 ? "unchanged" : "removed",
            fileCount: removedPaths.length,
            ...(result.nativeLocations === undefined
              ? {}
              : { nativeLocations: result.nativeLocations }),
            targets: removedPaths.map((filePath) => ({ path: filePath, change: "removed" })),
          },
        };
      }),
    ),
  });
});

export const collectHooksStep = Effect.fn("Sync.collectHooksStep")(function* (args: {
  readonly facts: ReadonlyArray<ProjectionInvariantFact>;
  readonly adapter: StepFailureConversionService;
  readonly prepared?: PreparedHookProjection;
}) {
  const facts = args.facts;
  const manager = yield* HookManager;
  const location = yield* WorkspaceLocation;
  if (args.prepared === undefined && !projectionFactsNeedReconciliation(facts))
    return Option.none<PlannedJobStep<SyncStepRequirements>>();
  const proposedResult =
    args.prepared === undefined
      ? undefined
      : yield* Effect.result(observeProjectionPlans(args.prepared.plans));
  if (proposedResult !== undefined && Result.isFailure(proposedResult)) {
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: SYNC_RECOVERY_IDS.hookProjections,
      label: "managed hook projections",
      readiness: "error",
      errorMessage: args.adapter.toStepFailure(proposedResult.failure).detail,
    });
  }
  const proposed = proposedResult?.success;
  const agentOutcomes =
    args.prepared?.agentOutcomes ??
    (manager.configuredAgentOutcomes === undefined
      ? []
      : yield* manager.configuredAgentOutcomes("projected"));
  const artifact = {
    path: "managed hook projections",
    scope: location.scope,
    change: "updated",
    agentOutcomes,
    managedRegions: managedRegionsForFacts(facts),
    nativeLocations: combineNativeLocationOutcomes(
      proposed === undefined
        ? facts.flatMap((fact) => fact.observation.nativeLocations ?? [])
        : proposed.flatMap((observation) => observation.nativeLocations ?? []),
    ),
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
      const nativeObservation = yield* manager.aggregateProjectionObservation;
      const currentOutcomes =
        manager.configuredAgentOutcomes === undefined
          ? []
          : yield* manager.configuredAgentOutcomes("current");
      return {
        result: "success",
        message: "Reconciled managed native hook entries",
        artifact: {
          ...artifact,
          agentOutcomes: currentOutcomes,
          ...(nativeObservation.nativeLocations === undefined
            ? {}
            : { nativeLocations: nativeObservation.nativeLocations }),
        },
      } satisfies JobStepResult;
    }).pipe(Effect.mapError(args.adapter.toStepFailure)),
  });
});

export const collectInstructionStep = Effect.fn("Sync.collectInstructionStep")(function* (args: {
  readonly configuredAgents?: ReadonlyArray<string>;
  readonly newlyConfiguredAgentIds?: ReadonlyArray<string>;
  readonly nativeProjection?: NativeProjectionOptions;
  readonly projectionFacts: ReadonlyArray<ProjectionInvariantFact>;
  /** Native region writes already declared by preceding steps in this closure. */
  readonly precedingNativeLocations?: ReadonlyArray<NativeLocationOutcome>;
  readonly touchesRule: boolean;
  readonly adapter: StepFailureConversionService;
}) {
  const projectionFacts = args.projectionFacts;
  const settings = yield* SettingsReader;
  const location = yield* WorkspaceLocation;
  const config = yield* settings.instructionsConfig;
  const manager = yield* RuleManager;
  const unsupported = args.touchesRule
    ? projectionFacts.find(({ observation }) => observation.reasonCode === "unsupported-version")
    : undefined;
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
        scope: location.scope,
        change: "unchanged",
        managedRegions: managedRegionsForFacts(projectionFacts),
      },
    });
  }
  if (Option.isNone(config) || config.value === false) {
    if (!args.touchesRule || !projectionFactsNeedReconciliation(projectionFacts))
      return Option.none<PlannedJobStep<SyncStepRequirements>>();
    const targets = projectionFileTargets(projectionFacts);
    const artifact = {
      path: targets[0]?.path ?? "managed Rules region",
      scope: location.scope,
      change: targets[0]?.change ?? "updated",
      targets,
      managedRegions: managedRegionsForFacts(projectionFacts),
      nativeLocations: combineNativeLocationOutcomes(
        projectionFacts.flatMap((fact) => fact.observation.nativeLocations ?? []),
      ),
    } satisfies JobStepArtifact;
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: SYNC_RECOVERY_IDS.instructionReconcile,
      readiness: "ready",
      label: projectionDivergenceLabel("managed Rules region", projectionFacts),
      artifact,
      run: applyPlannedProjections({
        projectionPlans: () => manager.projectionPlans(args.nativeProjection),
      }).pipe(
        Effect.andThen(manager.aggregateProjectionObservation),
        Effect.mapError(args.adapter.toStepFailure),
        Effect.map((observation): JobStepResult => ({
          result: "success",
          message: "Reconciled the managed Rules region",
          artifact: {
            ...artifact,
            ...(observation.nativeLocations === undefined
              ? {}
              : { nativeLocations: observation.nativeLocations }),
          },
        })),
      ),
    });
  }

  const priorConfiguredAgents = yield* settings.configuredAgents;
  const configuredAgents = args.configuredAgents ?? priorConfiguredAgents;
  const eligibleAgentIds = (args.newlyConfiguredAgentIds ?? []).filter(
    (agent) => !priorConfiguredAgents.includes(agent) && configuredAgents.includes(agent),
  );
  const resolvedConfig = resolveInstructionsConfig(config.value);
  const path = yield* Path.Path;
  const sourceWrites = [
    ...(args.touchesRule
      ? projectionFacts.flatMap((fact) => fact.observation.nativeLocations ?? [])
      : []),
    ...(args.precedingNativeLocations ?? []),
  ]
    .filter(
      (unit) =>
        unit.address.kind === "region" &&
        (unit.state === "created" || unit.state === "updated" || unit.state === "removed"),
    )
    .flatMap((unit) => [unit.address.path, ...unit.aliases]);
  const prospectiveRoots = [
    ...new Set(
      sourceWrites
        .filter((source) => path.basename(source) === resolvedConfig.fileName)
        .map((source) => path.dirname(source)),
    ),
  ];
  const observed = yield* observeInstructionProjection({
    workspaceRoot: location.baseDir,
    nativeDirectoryInputs: location.nativeDirectoryInputs,
    scope: location.scope,
    configuredAgents,
    eligibleAgentIds,
    config: resolvedConfig,
    prospectiveRoots,
  });
  const prior =
    eligibleAgentIds.length === 0
      ? undefined
      : yield* observeInstructionProjection({
          workspaceRoot: location.baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          scope: location.scope,
          configuredAgents: priorConfiguredAgents,
          config: resolvedConfig,
          symlinkSupported: observed.symlinkSupported,
        });
  const priorEntries = yield* Effect.forEach(
    prior?.plan.items.filter((item) => item.action !== "skip") ?? [],
    (item) =>
      resolveNativeEntry(item.targetPath).pipe(
        Effect.map((entry) => entry.entryPath),
        Effect.option,
      ),
  );
  const previousPaths = new Set(priorEntries.flatMap(Option.toArray));
  const priorRoutesKnown = priorEntries.every(Option.isSome);
  const eligibleTargets = (yield* Effect.forEach(observed.plan.items, (item) =>
    Effect.gen(function* () {
      if (!priorRoutesKnown || item.action === "skip" || !eligibleAgentIds.includes(item.agentId))
        return [];
      const entry = yield* resolveNativeEntry(item.targetPath).pipe(Effect.option);
      return Option.isSome(entry) && !previousPaths.has(entry.value.entryPath)
        ? [entry.value.entryPath]
        : [];
    }),
  )).flat();
  const snapshot = { ...observed, eligibleTargets };
  const instructionEffects = instructionProjectionEffects(snapshot, sourceWrites);
  const regionCurrent = !args.touchesRule || !projectionFactsNeedReconciliation(projectionFacts);
  const current =
    snapshot.status.missingSources.length === 0 &&
    regionCurrent &&
    instructionProjectionIsCurrent(snapshot) &&
    instructionEffects.length === 0;
  if (current) return Option.none<PlannedJobStep<SyncStepRequirements>>();

  const readiness = yield* instructionReconciliationReadiness({
    snapshot,
    workspaceRoot: location.baseDir,
  });
  if (Option.isSome(readiness)) {
    return Option.some<PlannedJobStep<SyncStepRequirements>>({
      key: SYNC_RECOVERY_IDS.instructionReconcile,
      readiness: "error",
      label: "instruction files",
      errorMessage: args.adapter.toStepFailure(readiness.value).detail,
    });
  }

  const ruleTargets = args.touchesRule ? projectionFileTargets(projectionFacts) : [];
  const instructionTargets = instructionEffects.map((effect) => ({
    ...effect,
    path: path.relative(location.baseDir, effect.path),
  }));
  const targets = mergeArtifactTargets([...ruleTargets, ...instructionTargets]);
  const artifact = {
    path: targets[0]?.path ?? resolvedConfig.fileName,
    scope: location.scope,
    change: targets[0]?.change ?? "updated",
    managedRegions: args.touchesRule ? managedRegionsForFacts(projectionFacts) : [],
    nativeLocations: combineNativeLocationOutcomes([
      ...instructionProjectionNativeLocations(snapshot, "reconcile", sourceWrites),
      ...projectionFacts.flatMap((fact) => fact.observation.nativeLocations ?? []),
    ]),
    targets,
  } satisfies JobStepArtifact;

  return Option.some<PlannedJobStep<SyncStepRequirements>>({
    key: SYNC_RECOVERY_IDS.instructionReconcile,
    readiness: "ready",
    label: projectionDivergenceLabel("instruction files", projectionFacts),
    artifact,
    run: Effect.gen(function* () {
      if (args.touchesRule)
        yield* applyPlannedProjections({
          projectionPlans: () => manager.projectionPlans(args.nativeProjection),
        });
      const ruleLocations = args.touchesRule
        ? ((yield* manager.aggregateProjectionObservation).nativeLocations ?? [])
        : [];
      const result = yield* reconcileInstructionAliases({
        configuredAgents,
        eligibleAgentIds,
        eligibleTargets,
      });
      return combineNativeLocationOutcomes([
        ...ruleLocations,
        ...(Option.isSome(result) ? result.value.nativeLocations : []),
      ]);
    }).pipe(
      Effect.mapError(args.adapter.toStepFailure),
      Effect.map((nativeLocations): JobStepResult => ({
        result: "success",
        message: "Reconciled canonical instructions, aliases, and gitignore entries",
        artifact: { ...artifact, nativeLocations },
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
  readonly adapter: StepFailureConversionService;
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
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const acceptedWriter = yield* AcceptedResolutionWriter;
    const configuredAgentIds = yield* settings.configuredAgents;
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
      jobs.push({ concurrency: 16, steps: ruleSteps });
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
      const refs =
        step.readiness === "error"
          ? []
          : [
              ...(step.acquisitionRefs ?? []),
              ...(step.sourceBinding === undefined
                ? []
                : [step.sourceBinding.ref, ...(step.sourceBinding.members ?? [])]),
            ];
      const keys = new Set([
        ...aggregateKeys(step),
        ...refs.flatMap((ref) =>
          ref.refType === "workspace" ? [] : [`retained:${retainedPackageKeyForRef(ref)}`],
        ),
      ]);
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
        if (node.type === "mcp-server" && isSourcedDesiredExtension(node)) {
          keys.add(`mcp-source:${desiredMcpSourceKey(node.identity)}`);
        }
        if (node.type === "pack") {
          const identity = desiredPackageKey(node.identity);
          keys.add(`pack:${identity}`);
          if (
            graph.nodes.some(
              (member) =>
                (member.type === "rule" || member.type === "hook" || member.type === "knowledge") &&
                member.origins.some(
                  (origin) => origin.type === "pack" && origin.pack.fqn === identity,
                ),
            )
          ) {
            keys.add("native:instruction-contributors");
          }
        }
        for (const origin of node.origins)
          if (origin.type === "pack") keys.add(`pack:${origin.pack.fqn}`);
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
    // Fully blocked components have no transition to couple. Keep each named
    // refusal visible instead of collapsing every prevented subject into one row.
    // Joining a later aggregate step must not move its earlier materialization
    // behind cleanup, whose final readback observes the settled workspace.
    components.sort(
      (left, right) =>
        Math.min(...left.steps.map((step) => ordered.indexOf(step))) -
        Math.min(...right.steps.map((step) => ordered.indexOf(step))),
    );
    const reportedComponents = components.flatMap((component) =>
      component.steps.every((step) => step.readiness === "error")
        ? component.steps.map((step) => ({ keys: component.keys, steps: [step] }))
        : [component],
    );
    const closures = yield* Effect.forEach(reportedComponents, ({ keys, steps }) => {
      // Read back this closure's subjects. An independent unfinished Pack
      // cannot make a skill closure depend on unrelated aggregate projections.
      const subjects = graph.nodes.filter(
        (node) =>
          keys.has(`subject:${node.type}:${node.name}`) ||
          (node.type === "mcp-server" &&
            isSourcedDesiredExtension(node) &&
            keys.has(`mcp-source:${desiredMcpSourceKey(node.identity)}`)) ||
          node.origins.some(
            (origin) => origin.type === "pack" && keys.has(`pack:${origin.pack.fqn}`),
          ) ||
          (keys.has("native:instruction-contributors") &&
            (node.type === "rule" || node.type === "hook" || node.type === "knowledge")),
      );
      const scopedSubjects = subjects.length === 0 ? undefined : subjects;
      const single = steps.length === 1 ? steps[0] : undefined;
      if (single !== undefined && single.readiness !== "error")
        return Effect.succeed({
          ...single,
          run: runWorkspaceTransaction<
            {
              readonly result: JobStepResult;
              readonly retained: ReadonlyArray<NativeRetentionWitness>;
            },
            WorkspaceSyncFailed | StepFailure,
            R | Effect.Services<ReturnType<typeof validateNativeOutputPostconditions>>
          >({
            transition: Effect.gen(function* () {
              const retained = yield* captureNativeOutputRetention(
                single.artifact?.nativeLocations ?? [],
              );
              const result = yield* single.run;
              if (result.result === "error") return yield* result.error;
              return { result, retained };
            }),
            validate: ({ result, retained }) =>
              result.result === "success"
                ? validateNativeOutputPostconditions(
                    result.artifact?.nativeLocations ?? [],
                    single.artifact?.nativeLocations ?? [],
                    retained,
                    scopedSubjects,
                    graph,
                  )
                : Effect.void,
          }).pipe(
            Effect.map(({ result }) => result),
            Effect.mapError(adapter.toStepFailure),
          ),
        });
      if (single !== undefined) return Effect.succeed(single);
      // Preserve the topological order even when this step joins earlier components.
      steps.sort((left, right) => ordered.indexOf(left) - ordered.indexOf(right));
      const artifacts = steps.flatMap((step) =>
        step.artifact === undefined ? [] : [step.artifact],
      );
      return buildReconciliationClosure<
        WorkspaceSyncFailed,
        R | Effect.Services<ReturnType<typeof validateNativeOutputPostconditions>>
      >({
        nativeReaderContext: {
          workspaceRoot: location.baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          configuredAgentIds,
        },
        toStepFailure: (failure) =>
          failure._tag === "StepFailure" ? failure : adapter.toStepFailure(failure),
        label: steps.map((step) => step.label).join("; "),
        message: "Reconciled dependent workspace state",
        acceptedResolutions: acceptedWriter.withBatch,
        artifact: {
          path: artifacts[0]?.path ?? settingsDisplayPath(scope),
          scope,
          change: "updated",
          targets: artifacts.flatMap((artifact) => artifact.targets ?? []),
          references: artifacts.flatMap((artifact) => artifact.references ?? []),
          managedRegions: artifacts.flatMap((artifact) => artifact.managedRegions ?? []),
        },
        children: steps.map((step) => ({ step, coverage: "ineligible" })),
        validate: Effect.void,
        captureNativeRetention: captureNativeOutputRetention,
        validateNativeOutputs: (evidence, expected, retained) =>
          validateNativeOutputPostconditions(evidence, expected, retained, scopedSubjects, graph),
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
    } satisfies Plan<
      | R
      | WorkspaceTransactionScope
      | FileSystem.FileSystem
      | Path.Path
      | Effect.Services<ReturnType<typeof validateNativeOutputPostconditions>>
    >;
  });
