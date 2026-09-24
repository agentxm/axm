/**
 * Plan<StepRequirements>-family machine document (`plan-result-v3`) and the emit boundary.
 *
 * `emitOperationResolution` is the one place a plan-family command terminates:
 * it derives the outcome and exit code from the resolution with the shared
 * pure derivations, records completion semantics for telemetry, emits the
 * machine document, and projects the human render. No channel re-derives its
 * own account of what happened.
 */

import { collectSensitiveStrings, redactRegistryText } from "@agentxm/registry-client";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Verbosity } from "./cli-flags/index.js";
import {
  SuggestedActionSchema,
  type SuggestedAction,
} from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  setCommandSemanticProperties,
  getCommandSemanticProperties,
  setOperationExitCode,
  summarizeCommandOutcome,
  type CommandOutcomeSummary,
  type SourceKind,
  type SubjectType,
} from "./cli-runtime/index.js";
import {
  ArtifactMechanismSchema,
  PackMembershipDeltaSchema,
  AtomicityClassSchema,
  BlockingClassSchema,
  FailureMetadataSchema,
  FailureProblemSchema,
  OperationOutcomeSchema,
  OperationPhaseSchema,
  OperationPreconditionSchema,
  PlanRiskConditionSchema,
  UnitDispositionSchema,
  UnitStateSchema,
  awaitDrained,
  countUnitStates,
  deriveOperationOutcome,
  makeOperationResolution,
  renderConfirmationRecoveryCommand,
  settleOperation,
  unitsByStableIdentity,
  type ConfirmationRecovery,
  type FailureSuggestedAction,
  type JobStepArtifact,
  type OperationOutcome,
  type OperationResolution,
  type ResolvedUnit,
  type StepFailure,
  stepFailureRetryCanHelp,
} from "@agentxm/workspace/transitions/planning";
import { operationExitCode, operationOk } from "./operation-exit-code.js";
import {
  ArtifactChangeSchema,
  ConfiguredAgentOutcomeSchema,
} from "@agentxm/workspace/desired-state";
import {
  AppErrorCodeSchema,
  ExitCode,
  appErrorCodeForExit,
  defaultTitleFor,
  redactAppErrorMetadata,
  redactCredentialBearingLocator,
} from "./app-error/index.js";
import { SerializedErrorCauseSchema, serializeErrorCauseChain } from "./app-error/cause-chain.js";
import { formatMinimumReleaseAgeSeconds } from "@agentxm/workspace/resolution";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";
import { ArchivalViewSchema } from "@agentxm/extension-model/unstable/extensions/archival";
import { CatalogExtensionTypeSchema } from "@agentxm/extension-model/unstable/extension-types";

import { operationDoc, resolutionAgentCoverage, unsettledUnits } from "./operation-view.js";
import { emitResult, count, type Doc } from "./screen/index.js";
import { ScopedRoutes, suggestionsForCurrentWorkspace } from "./root/shared/scoped-command.js";
import type { TargetedUpdatePublicContext } from "@agentxm/workspace/resolution";

export const PLAN_RESULT_CONTRACT = "plan-result-v3";

// -----------------------------------------------------------------------------
// Wire schemas
// -----------------------------------------------------------------------------

export const AgentCoverageSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user"] as const),
  agents: Schema.Array(Schema.String),
}).annotate({
  identifier: "AgentCoverage",
  title: "Agent Coverage",
  description: "Coding agents where at least one retained coverage-applicable extension is usable.",
});
export type AgentCoverage = typeof AgentCoverageSchema.Type;

const StepArtifactTargetSchema = Schema.Struct({
  path: Schema.String,
  change: ArtifactChangeSchema,
  agentIds: Schema.optional(Schema.Array(Schema.String)),
  unitId: Schema.optional(Schema.String),
  owner: Schema.optional(Schema.String),
  entryName: Schema.optional(Schema.String),
}).annotate({
  identifier: "StepArtifactTarget",
  title: "Plan Step Artifact Target",
  description: "One materialized target surface for a plan step artifact.",
});

const StepArtifactSourceSchema = Schema.Struct({
  type: Schema.String,
  origin: Schema.String,
  ref: Schema.optional(Schema.String),
  directory: Schema.optional(Schema.String),
  gitTreeHash: Schema.optional(Schema.String),
}).annotate({
  identifier: "StepArtifactSource",
  title: "Plan Step Artifact Source",
  description: "Optional source metadata describing where the artifact came from.",
});

const StepManagedRegionSchema = Schema.Struct({
  unitId: Schema.String,
  path: Schema.String,
  owner: Schema.String,
}).annotate({
  identifier: "StepManagedRegion",
  title: "Plan Step Managed Region",
  description: "One managed-region ownership unit and its provenance owner.",
});

const StepArtifactReferenceSchema = Schema.Struct({
  path: Schema.String,
  state: Schema.Literals(["retained", "absent", "unknown"]),
  reason: Schema.String,
  unitId: Schema.optional(Schema.String),
  owner: Schema.optional(Schema.String),
});

const SourceSwitchEndpointSchema = Schema.Struct({
  family: Schema.Literals(["registry", "git", "path"] as const),
  locator: Schema.String,
  resolution: Schema.String,
  treeIntegrity: Schema.String,
});

const PackMemberSourceSwitchEndpointSchema = Schema.Struct({
  family: Schema.Literals(["registry", "git", "path", "workspace"] as const),
  locator: Schema.String,
  resolution: Schema.String,
});

const PackMemberSourceSwitchEvidenceSchema = Schema.Struct({
  member: Schema.String,
  disposition: Schema.Literals([
    "added",
    "removed",
    "retained",
    "source-changed",
    "version-changed",
    "unchanged",
  ] as const),
  before: Schema.optional(PackMemberSourceSwitchEndpointSchema),
  after: Schema.optional(PackMemberSourceSwitchEndpointSchema),
});

const SourceSwitchEvidenceSchema = Schema.Struct({
  before: SourceSwitchEndpointSchema,
  after: SourceSwitchEndpointSchema,
  content: Schema.Literals(["equivalent", "changed"] as const),
  dependencies: Schema.Struct({
    effect: Schema.Literals(["not-applicable", "unchanged", "changed"] as const),
    added: Schema.Array(Schema.String),
    removed: Schema.Array(Schema.String),
    changed: Schema.Array(Schema.String),
  }),
  projections: Schema.Struct({
    effect: Schema.Literal("reconcile"),
    detail: Schema.String,
  }),
  guarantees: Schema.Struct({
    gained: Schema.Array(Schema.String),
    lost: Schema.Array(Schema.String),
  }),
  packMembers: Schema.optional(Schema.Array(PackMemberSourceSwitchEvidenceSchema)),
});

const StepArtifactSchema = Schema.Struct({
  path: Schema.optional(Schema.String),
  scope: Schema.Literals(["project", "user"] as const),
  agents: Schema.optional(Schema.Array(Schema.String)),
  version: Schema.optional(Schema.String),
  change: ArtifactChangeSchema,
  mechanism: Schema.optional(ArtifactMechanismSchema),
  previousVersion: Schema.optional(Schema.String),
  fileCount: Schema.optional(Schema.Number),
  targets: Schema.optional(Schema.Array(StepArtifactTargetSchema)),
  references: Schema.optional(Schema.Array(StepArtifactReferenceSchema)),
  agentOutcomes: Schema.optional(Schema.Array(ConfiguredAgentOutcomeSchema)),
  source: Schema.optional(StepArtifactSourceSchema),
  managedRegions: Schema.optional(Schema.Array(StepManagedRegionSchema)),
  packMembership: Schema.optional(PackMembershipDeltaSchema),
  registryLifecycle: Schema.optional(
    Schema.Struct({
      archival: Schema.optional(ArchivalViewSchema),
      deprecation: Schema.optional(DeprecationViewSchema),
    }),
  ),
  sourceSwitch: Schema.optional(SourceSwitchEvidenceSchema),
}).annotate({
  identifier: "StepArtifact",
  title: "Plan Step Artifact",
  description: "Optional artifact metadata describing what changed and where.",
});
type StepArtifact = typeof StepArtifactSchema.Type;

const OperationFailureSchema = Schema.Struct({
  code: AppErrorCodeSchema,
  title: Schema.optional(Schema.String),
  message: Schema.String,
  problem: Schema.optional(FailureProblemSchema),
  metadata: Schema.optional(FailureMetadataSchema),
  retryable: Schema.optional(Schema.Boolean),
  causes: Schema.optional(Schema.Array(SerializedErrorCauseSchema)),
}).annotate({
  identifier: "OperationFailure",
  title: "Operation Failure",
  description: "Typed failure cause for an operation or unit that failed.",
});

const OperationBlockSchema = Schema.Struct({
  class: BlockingClassSchema,
  subject: Schema.String,
  phase: OperationPhaseSchema,
  detail: Schema.String,
  causeCode: Schema.optional(AppErrorCodeSchema),
  reference: Schema.optional(Schema.String),
  escape: Schema.optional(SuggestedActionSchema),
}).annotate({
  identifier: "OperationBlock",
  title: "Operation Block",
  description:
    "A typed blocking condition: reason class, blocked subject, phase, and the escape that resolves it.",
});

const UnitSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  state: UnitStateSchema,
  disposition: Schema.optional(UnitDispositionSchema),
  blocking: Schema.optional(OperationBlockSchema),
  message: Schema.optional(Schema.String),
  warnings: Schema.optional(Schema.Array(Schema.String)),
  code: Schema.optional(Schema.String),
  error: Schema.optional(OperationFailureSchema),
  artifact: Schema.optional(StepArtifactSchema),
  agentOutcomes: Schema.optional(Schema.Array(ConfiguredAgentOutcomeSchema)),
  registryLifecycle: Schema.optional(
    Schema.Struct({
      archival: Schema.optional(ArchivalViewSchema),
      deprecation: Schema.optional(DeprecationViewSchema),
    }),
  ),
  links: Schema.optional(
    Schema.Struct({
      html: Schema.String,
    }),
  ),
}).annotate({
  identifier: "Unit",
  title: "Operation Unit",
  description: "One unit of work in a resolved operation, in its canonical state.",
});
type Unit = typeof UnitSchema.Type;

const UnitCountsSchema = Schema.Struct({
  total: Schema.Number,
  planned: Schema.Number,
  ready: Schema.Number,
  committed: Schema.Number,
  unchanged: Schema.Number,
  failed: Schema.Number,
  rolledBack: Schema.Number,
  blocked: Schema.Number,
  skipped: Schema.Number,
  cancelled: Schema.Number,
  interrupted: Schema.Number,
  warnings: Schema.Number,
}).annotate({
  identifier: "UnitCounts",
  title: "Unit Counts",
  description:
    "Reconciling unit-state counts: the state buckets partition the unit set and sum to total; warnings counts annotations.",
});

const OperationAtomicitySchema = Schema.Struct({
  declared: AtomicityClassSchema,
  applied: AtomicityClassSchema,
}).annotate({
  identifier: "OperationAtomicity",
  title: "Operation Atomicity",
  description: "The atomicity class the operation declared and the class that actually applied.",
});

const OperationInterruptionSchema = Schema.Struct({
  signal: Schema.Literals(["SIGINT", "SIGTERM"] as const),
  disposition: Schema.Literals(["restored", "retained", "unknown", "none"] as const),
}).annotate({
  identifier: "OperationInterruption",
  title: "Operation Interruption",
  description: "External termination and the durable-state disposition it left.",
});

const FootprintEntrySchema = Schema.Struct({
  path: Schema.String,
  change: Schema.Literals(["created", "modified", "removed", "restored"] as const),
}).annotate({
  identifier: "FootprintEntry",
  title: "Footprint Entry",
  description: "One observed durable change or restoration.",
});

const OperationRecoverySchema = Schema.Struct({
  retained: Schema.Array(Schema.String),
  snapshotDir: Schema.optional(Schema.String),
  actions: Schema.Array(SuggestedActionSchema),
}).annotate({
  identifier: "OperationRecovery",
  title: "Operation Recovery",
  description:
    "Machine-readable recovery content: retained durable state, preserved pre-change snapshots, and resolving actions. Never blocks a later invocation.",
});

const ReleaseAgeRecordSchema = Schema.Struct({
  reason: Schema.Literal("minimum-release-age"),
  target: Schema.String,
  dependencyPath: Schema.Array(Schema.String),
  requestedRange: Schema.optional(Schema.String),
  currentVersion: Schema.optional(Schema.String),
  selectedVersion: Schema.optional(Schema.String),
  candidateVersion: Schema.String,
  publishedAt: Schema.String,
  eligibleAt: Schema.String,
  minimumReleaseAgeSeconds: Schema.Number,
  bypassCause: Schema.optional(Schema.Literals(["exclude", "ignore-flag"] as const)),
  exemptionScope: Schema.optional(Schema.Literals(["project", "user"] as const)),
}).annotate({
  identifier: "ReleaseAgeRecord",
  title: "Release Age Record",
  description: "One deterministic minimum-release-age holdback or bypass record.",
});

type ReleaseAgeRecordView = typeof ReleaseAgeRecordSchema.Type;

const TargetedUpdateEffectSchema = Schema.Literals(["unchanged", "may-update"] as const);
const TargetedUpdateContextSchema = Schema.Struct({
  target: Schema.Struct({
    type: CatalogExtensionTypeSchema,
    name: Schema.String,
    fqn: Schema.String,
  }),
  ownership: Schema.Literals(["absent", "direct-only", "pack-only", "combined"] as const),
  activation: Schema.Literals(["enabled", "disabled"] as const),
  authority: Schema.Literals(["direct", "pack-aware", "blocked"] as const),
  direct: Schema.optional(
    Schema.Struct({
      source: Schema.Literals(["bundled", "inline", "registry", "workspace"] as const),
      enabled: Schema.Boolean,
      constraint: Schema.optional(Schema.String),
    }),
  ),
  packs: Schema.Array(
    Schema.Struct({
      fqn: Schema.String,
      configuredName: Schema.optional(Schema.String),
      source: Schema.optional(Schema.Literals(["registry", "workspace"] as const)),
      memberSource: Schema.Literals(["registry", "workspace"] as const),
      constraint: Schema.String,
      enabled: Schema.Boolean,
    }),
  ),
  effectiveConstraint: Schema.optional(Schema.String),
  memberClosure: Schema.Array(
    Schema.Struct({
      type: CatalogExtensionTypeSchema,
      name: Schema.String,
      fqn: Schema.String,
    }),
  ),
  effects: Schema.Struct({
    settings: TargetedUpdateEffectSchema,
    acceptedResolution: TargetedUpdateEffectSchema,
    canonical: TargetedUpdateEffectSchema,
    projection: TargetedUpdateEffectSchema,
    packRoot: TargetedUpdateEffectSchema,
    packManifest: TargetedUpdateEffectSchema,
  }),
  relevantProblems: Schema.Array(Schema.String),
  blocker: Schema.optional(
    Schema.Literals([
      "not-desired",
      "disabled",
      "pack-owned-constraint",
      "incomplete-graph",
      "constraint-conflict",
      "bundled-source",
      "source-authority",
      "stale-plan",
    ] as const),
  ),
}).annotate({
  identifier: "TargetedUpdateContext",
  title: "Targeted Update Context",
  description: "Sanitized ownership, authority, constraint, closure, and state-effect facts.",
});

export const PlanResolutionResultSchema = Schema.Struct({
  contract: Schema.Literal(PLAN_RESULT_CONTRACT),
  outcome: OperationOutcomeSchema,
  mode: Schema.Literals(["preview", "apply"] as const),
  planName: Schema.String,
  planDescription: Schema.optional(Schema.String),
  candidateId: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  atomicity: OperationAtomicitySchema,
  blocking: Schema.optional(OperationBlockSchema),
  failure: Schema.optional(OperationFailureSchema),
  interruption: Schema.optional(OperationInterruptionSchema),
  divergence: Schema.optional(Schema.Boolean),
  counts: UnitCountsSchema,
  units: Schema.Array(UnitSchema),
  footprint: Schema.optional(Schema.Array(FootprintEntrySchema)),
  recovery: Schema.optional(OperationRecoverySchema),
  evaluatedAt: Schema.optional(Schema.String),
  holdbackCount: Schema.optional(Schema.Number),
  holdbacks: Schema.optional(Schema.Array(ReleaseAgeRecordSchema)),
  releaseAgeBypassCount: Schema.optional(Schema.Number),
  releaseAgeBypasses: Schema.optional(Schema.Array(ReleaseAgeRecordSchema)),
  imports: Schema.optional(
    Schema.Struct({
      imported: Schema.Number,
      skipped: Schema.Number,
      conflicting: Schema.Number,
    }),
  ),
  preconditions: Schema.optional(Schema.Array(OperationPreconditionSchema)),
  riskConditions: Schema.optional(Schema.Array(PlanRiskConditionSchema)),
  agentCoverage: Schema.optional(AgentCoverageSchema),
  targetedUpdate: Schema.optional(TargetedUpdateContextSchema),
}).annotate({
  identifier: "PlanResolutionResult",
  title: "Plan Resolution Result",
  description:
    "Resolved plan-family operation: canonical outcome, typed blocking, atomicity, reconciling counts, and identity-ordered units.",
});
export type PlanResolutionResult = typeof PlanResolutionResultSchema.Type;

const PlanResolutionDocumentFields = {
  result: PlanResolutionResultSchema,
} satisfies Schema.Struct.Fields;
export const PlanResolutionDocumentSchema = Schema.Struct(PlanResolutionDocumentFields).annotate({
  identifier: "PlanResolutionDocument",
  title: "Plan Resolution Document",
  description: "Top-level machine-output payload for a resolved AXM operation.",
});
export type PlanResolutionDocument = typeof PlanResolutionDocumentSchema.Type;

// -----------------------------------------------------------------------------
// Projection
// -----------------------------------------------------------------------------

export interface PlanResolutionResultOptions {
  readonly verbose?: boolean;
  readonly debug?: boolean;
  readonly message?: string;
  readonly imports?: {
    readonly imported: number;
    readonly skipped: number;
    readonly conflicting: number;
  };
  readonly targetedUpdate?: TargetedUpdatePublicContext;
}

const artifactForJson = (
  artifact: JobStepArtifact,
  options: PlanResolutionResultOptions,
): StepArtifact => {
  const { targets, source, sourceSwitch, managedRegions, references, ...base } = artifact;
  const sanitizedBase = {
    ...base,
    ...(sourceSwitch === undefined
      ? {}
      : {
          sourceSwitch: {
            ...sourceSwitch,
            before: {
              ...sourceSwitch.before,
              locator: redactCredentialBearingLocator(sourceSwitch.before.locator),
            },
            after: {
              ...sourceSwitch.after,
              locator: redactCredentialBearingLocator(sourceSwitch.after.locator),
            },
            ...(sourceSwitch.packMembers === undefined
              ? {}
              : {
                  packMembers: sourceSwitch.packMembers.map((member) => ({
                    ...member,
                    ...(member.before === undefined
                      ? {}
                      : {
                          before: {
                            ...member.before,
                            locator: redactCredentialBearingLocator(member.before.locator),
                          },
                        }),
                    ...(member.after === undefined
                      ? {}
                      : {
                          after: {
                            ...member.after,
                            locator: redactCredentialBearingLocator(member.after.locator),
                          },
                        }),
                  })),
                }),
          },
        }),
    ...(references === undefined
      ? {}
      : {
          references: references.map((reference) => ({
            ...reference,
            path: redactRegistryText(reference.path),
            reason: redactRegistryText(reference.reason),
          })),
        }),
    ...(base.path === undefined ? {} : { path: redactRegistryText(base.path) }),
    ...(managedRegions === undefined
      ? {}
      : {
          managedRegions: managedRegions.map((region) => ({
            ...region,
            path: redactRegistryText(region.path),
          })),
        }),
  };
  const sanitizedSource =
    source === undefined
      ? undefined
      : {
          ...source,
          origin: redactRegistryText(source.origin),
          ...(source.ref === undefined ? {} : { ref: redactRegistryText(source.ref) }),
        };
  const rest =
    options.debug === true && sanitizedSource !== undefined
      ? { ...sanitizedBase, source: sanitizedSource }
      : sanitizedBase;
  if (targets === undefined) return rest;
  const additionalTargets = artifact.targets?.filter(
    (target) => target.path !== artifact.path || target.unitId !== undefined,
  );
  return additionalTargets === undefined || additionalTargets.length === 0
    ? rest
    : {
        ...rest,
        targets: additionalTargets.map((target) => ({
          ...target,
          path: redactRegistryText(target.path),
        })),
      };
};

/**
 * What a failure states as machine output carries it: its code, its redacted
 * sentence and title, the structured problem, redacted request evidence,
 * retryability, and — at verbose and debug levels — its cause chain. The
 * exact credentials its evidence carries under sensitive keys are erased from
 * every sentence, with the one policy every machine document applies.
 */
const failureForJson = (failure: StepFailure, options: PlanResolutionResultOptions) => {
  const secrets = collectSensitiveStrings(failure.metadata);
  const causes =
    options.verbose === true || options.debug === true
      ? serializeErrorCauseChain(failure.cause, { debug: options.debug === true, secrets })
      : [];
  return {
    code: failure.category,
    message: redactRegistryText(failure.detail, { secrets }),
    title: redactRegistryText(failure.title ?? defaultTitleFor(failure.category), { secrets }),
    ...(failure.problem === undefined ? {} : { problem: failure.problem }),
    ...(failure.metadata === undefined
      ? {}
      : { metadata: redactAppErrorMetadata(failure.metadata, secrets) }),
    ...(failure.retryable === undefined ? {} : { retryable: failure.retryable }),
    ...(causes.length > 0 ? { causes } : {}),
  };
};

const unitForJson = (unit: ResolvedUnit<unknown>, options: PlanResolutionResultOptions): Unit => {
  const includeErrorDetails = options.verbose === true || options.debug === true;
  const secrets = collectSensitiveStrings(unit.error?.metadata);
  return {
    id: unit.id,
    label: unit.label,
    state: unit.state,
    ...(unit.disposition === undefined ? {} : { disposition: unit.disposition }),
    ...(unit.blocking === undefined
      ? {}
      : {
          blocking: {
            ...unit.blocking,
            detail: redactRegistryText(unit.blocking.detail, { secrets }),
          },
        }),
    ...(unit.message === undefined || unit.message.length === 0
      ? {}
      : { message: redactRegistryText(unit.message, { secrets }) }),
    ...(unit.warnings === undefined || unit.warnings.length === 0
      ? {}
      : { warnings: unit.warnings.map((warning) => redactRegistryText(warning, { secrets })) }),
    ...(unit.error === undefined ? {} : { code: unit.error.category }),
    ...(unit.error !== undefined && includeErrorDetails
      ? { error: failureForJson(unit.error, options) }
      : {}),
    ...(unit.artifact === undefined ? {} : { artifact: artifactForJson(unit.artifact, options) }),
    ...(unit.agentOutcomes === undefined ? {} : { agentOutcomes: unit.agentOutcomes }),
    ...(unit.registryLifecycle === undefined ? {} : { registryLifecycle: unit.registryLifecycle }),
    ...(unit.links === undefined ? {} : { links: { html: redactRegistryText(unit.links.html) } }),
  };
};

const releaseAgeResultFields = (resolution: OperationResolution<unknown>) =>
  resolution.releaseAge === undefined
    ? {}
    : {
        evaluatedAt: resolution.releaseAge.evaluatedAt,
        holdbackCount: resolution.releaseAge.holdbacks.length,
        holdbacks: resolution.releaseAge.holdbacks,
        releaseAgeBypassCount: resolution.releaseAge.bypasses.length,
        releaseAgeBypasses: resolution.releaseAge.bypasses,
      };

export const toPlanResolutionResult = (
  resolution: OperationResolution<unknown>,
  options: PlanResolutionResultOptions = {},
): PlanResolutionResult => {
  const outcome = deriveOperationOutcome(resolution);
  const counts = countUnitStates(resolution.units);
  const units = unitsByStableIdentity(resolution.units).map((unit) => unitForJson(unit, options));
  const description = Option.getOrUndefined(resolution.description);
  const coverage =
    outcome === "applied" || outcome === "no-op" ? resolutionAgentCoverage(resolution) : undefined;
  return {
    contract: PLAN_RESULT_CONTRACT,
    outcome,
    mode: resolution.mode,
    planName: resolution.name,
    ...(description === undefined ? {} : { planDescription: description }),
    ...(resolution.candidateId === undefined ? {} : { candidateId: resolution.candidateId }),
    ...(options.message === undefined ? {} : { message: options.message }),
    atomicity: resolution.atomicity,
    ...(resolution.blocking === undefined
      ? {}
      : {
          blocking: {
            ...resolution.blocking,
            detail: redactRegistryText(resolution.blocking.detail),
          },
        }),
    ...(resolution.failure === undefined
      ? {}
      : { failure: failureForJson(resolution.failure, options) }),
    ...(resolution.interruption === undefined ? {} : { interruption: resolution.interruption }),
    ...(resolution.divergence === undefined ? {} : { divergence: resolution.divergence }),
    counts: {
      total: counts.total,
      planned: counts.planned,
      ready: counts.ready,
      committed: counts.committed,
      unchanged: counts.unchanged,
      failed: counts.failed,
      rolledBack: counts.rolledBack,
      blocked: counts.blocked,
      skipped: counts.skipped,
      cancelled: counts.cancelled,
      interrupted: counts.interrupted,
      warnings: counts.warnings,
    },
    units,
    ...(resolution.footprint === undefined
      ? {}
      : {
          footprint: resolution.footprint.map((entry) => ({
            ...entry,
            path: redactRegistryText(entry.path),
          })),
        }),
    ...(resolution.recovery === undefined
      ? {}
      : {
          recovery: {
            ...resolution.recovery,
            retained: resolution.recovery.retained.map((path) => redactRegistryText(path)),
          },
        }),
    ...releaseAgeResultFields(resolution),
    ...(options.imports === undefined ? {} : { imports: options.imports }),
    ...(resolution.preconditions === undefined ? {} : { preconditions: resolution.preconditions }),
    ...(resolution.riskConditions === undefined
      ? {}
      : { riskConditions: resolution.riskConditions }),
    ...(coverage === undefined ? {} : { agentCoverage: coverage }),
    ...(options.targetedUpdate === undefined ? {} : { targetedUpdate: options.targetedUpdate }),
  };
};

/** Telemetry completion summary projected from the same resolution. */
export const operationResolutionSummary = (
  resolution: OperationResolution<unknown>,
  context: { readonly subjectType?: SubjectType; readonly sourceKind?: SourceKind } = {},
): CommandOutcomeSummary => {
  const outcome = deriveOperationOutcome(resolution);
  const counts = countUnitStates(resolution.units);
  return {
    outcome,
    ...(context.subjectType !== undefined ? { subjectType: context.subjectType } : {}),
    ...(context.sourceKind !== undefined ? { sourceKind: context.sourceKind } : {}),
    ...(counts.committed > 0 ? { appliedCount: counts.committed } : {}),
    ...(counts.failed > 0 ? { failedCount: counts.failed } : {}),
    ...(counts.blocked > 0 ? { blockedCount: counts.blocked } : {}),
  };
};

// -----------------------------------------------------------------------------
// Release-age human rendering (warnings survive --quiet)
// -----------------------------------------------------------------------------

const releaseAgeWindowLabel = (records: ReadonlyArray<ReleaseAgeRecordView>): string => {
  const windows = new Set(records.map((record) => record.minimumReleaseAgeSeconds));
  const [only] = windows;
  return windows.size === 1 && only !== undefined
    ? `${formatMinimumReleaseAgeSeconds(only)} minimum release age`
    : "minimum release age";
};

const releaseAgeWaitingPeriodLabel = (records: ReadonlyArray<ReleaseAgeRecordView>): string => {
  const windows = new Set(records.map((record) => record.minimumReleaseAgeSeconds));
  const [only] = windows;
  return windows.size === 1 && only !== undefined
    ? `${formatMinimumReleaseAgeSeconds(only)} waiting period`
    : "minimum release-age waiting period";
};

const releaseAgeRequiredBy = (record: ReleaseAgeRecordView): string => {
  const root = record.dependencyPath[0];
  return root === undefined || root === record.target ? "" : ` (required by ${root})`;
};

const releaseAgeExemption = (record: ReleaseAgeRecordView): string =>
  record.bypassCause === "exclude"
    ? `Allowed by ${record.exemptionScope ?? "unknown"} minimumReleaseAgeExclude`
    : "Allowed by --ignore-release-age for this run";

const releaseAgeHoldbackLine = (record: ReleaseAgeRecordView): string => {
  const kept = record.selectedVersion ?? record.currentVersion;
  const candidate = `${record.candidateVersion}${releaseAgeRequiredBy(record)}`;
  return kept === undefined
    ? `${record.target} ${candidate} was published ${record.publishedAt} and becomes available ${record.eligibleAt}`
    : `${record.target}: using ${kept}; ${candidate} was published ${record.publishedAt} and becomes available ${record.eligibleAt}`;
};

const releaseAgeBypassLines = (record: ReleaseAgeRecordView): ReadonlyArray<string> => [
  `${record.target} ${record.candidateVersion}${releaseAgeRequiredBy(record)} — published ${record.publishedAt}`,
  `${releaseAgeExemption(record)}; otherwise held until ${record.eligibleAt}`,
];

const RELEASE_AGE_OVERRIDE = "--ignore-release-age";

/**
 * The one-run override, named as the emitting invocation with the override
 * appended: the kernel renders the command from the invocation's own
 * recovery, so a targeted route keeps its target and a route whose values
 * cannot be echoed safely is described without a command. An operation with
 * no invocation to replay names the override alone.
 */
const releaseAgeOverride = (recovery: ConfirmationRecovery | undefined): string => {
  const command =
    recovery === undefined
      ? undefined
      : renderConfirmationRecoveryCommand(recovery, {
          approval: "none",
          additionalSwitches: [RELEASE_AGE_OVERRIDE],
        });
  return command === undefined
    ? `rerun the same command with ${RELEASE_AGE_OVERRIDE}`
    : `rerun ${command}`;
};

const releaseAgeRecoveryText = (
  recovery: ConfirmationRecovery | undefined,
  holdbacks: ReadonlyArray<ReleaseAgeRecordView>,
): string => {
  const targets = Array.from(
    new Set(holdbacks.map((holdback) => holdback.dependencyPath[0] ?? holdback.target)),
  );
  const exemption =
    targets.length === 1
      ? `declare ${targets[0]} in minimumReleaseAgeExclude`
      : "declare them in minimumReleaseAgeExclude";
  return `Wait until the release becomes available, pin an older available version, or ${exemption}. To take ${
    targets.length === 1 ? "it" : "them"
  } now for this run only, ${releaseAgeOverride(recovery)}.`;
};

/**
 * Whether re-running the emitting command could change what these units did.
 * The kernel decides per failure, from the producer's own verdict or its
 * category; this only asks whether any unsettled unit's failure admits one.
 */
export const retryCanHelp = (units: ReadonlyArray<ResolvedUnit<unknown>>): boolean =>
  units.some((unit) => unit.error !== undefined && stepFailureRetryCanHelp(unit.error));

/** The last path segment, which is the extension's own name in every form. */
const targetName = (value: string): string => value.split("/").at(-1) ?? value;

export const releaseAgeDoc = (
  recovery: ConfirmationRecovery | undefined,
  result: Pick<PlanResolutionResult, "holdbacks" | "releaseAgeBypasses">,
  settled?: { readonly unsettled: ReadonlySet<string> },
): Doc => {
  const holdbacks = result.holdbacks ?? [];
  // A bypass says a newer release was let into the workspace. Where the unit
  // it names did not settle as planned, nothing was let in, and a callout
  // saying it was contradicts the row above it. A holdback is unaffected: a
  // release that was held back was never attempted.
  const bypasses = (result.releaseAgeBypasses ?? []).filter(
    (bypass) => settled === undefined || !settled.unsettled.has(targetName(bypass.target)),
  );
  return [
    ...(holdbacks.length === 0
      ? []
      : [
          {
            _tag: "callout",
            tone: "warn",
            title: `${count(holdbacks.length, "newer release")} ${holdbacks.length === 1 ? "is" : "are"} still in the ${releaseAgeWaitingPeriodLabel(holdbacks)}`,
            children: [
              ...holdbacks.map(
                (holdback) =>
                  ({
                    _tag: "paragraph",
                    text: releaseAgeHoldbackLine(holdback),
                  }) as const,
              ),
              {
                _tag: "paragraph",
                text: releaseAgeRecoveryText(recovery, holdbacks),
              },
            ],
          } as const,
        ]),
    ...(bypasses.length === 0
      ? []
      : [
          {
            _tag: "callout",
            tone: "warn",
            title: `${count(bypasses.length, "release")} allowed before the ${releaseAgeWindowLabel(bypasses)}`,
            children: bypasses.flatMap((bypass) =>
              releaseAgeBypassLines(bypass).map(
                (line) =>
                  ({
                    _tag: "paragraph",
                    text: line,
                  }) as const,
              ),
            ),
          } as const,
        ]),
  ];
};

// -----------------------------------------------------------------------------
// The emit boundary
// -----------------------------------------------------------------------------

/**
 * What actually happened, for an adapter deciding what to offer next. Only the
 * adapter knows how its own routes are spelled, and only the resolution knows
 * which units are still waiting to be acted on, so the two meet here.
 */
export interface OperationRecoveryContext {
  readonly outcome: OperationOutcome;
  /** The units that did not settle as planned, in ledger order. */
  readonly unsettled: ReadonlyArray<ResolvedUnit<unknown>>;
}

/**
 * The actions a command offers next: a fixed list where the command offers the
 * same thing however it settles, or a function of the outcome where it does
 * not.
 */
export type OperationSuggestions =
  | ReadonlyArray<SuggestedAction>
  | ((context: OperationRecoveryContext) => ReadonlyArray<SuggestedAction>);

export interface EmitOperationResolutionOptions {
  /**
   * The invocation that produced this resolution, as a recovery line replays
   * it. A condition the operation reports names its recovery through this
   * value; an operation with no invocation to replay, such as an interrupted
   * one, leaves it out.
   */
  readonly recovery?: ConfirmationRecovery;
  readonly suggestions?: OperationSuggestions;
  readonly withoutSuggestions?: boolean;
  /** Overrides the derived human headline and is carried in the document. */
  readonly message?: string;
  readonly imports?: {
    readonly imported: number;
    readonly skipped: number;
    readonly conflicting: number;
  };
  readonly targetedUpdate?: TargetedUpdatePublicContext;
}

export interface EmittedOperationResolution {
  readonly outcome: OperationOutcome;
  readonly exitCode: number;
  readonly emitted: boolean;
}

/**
 * The recoveries a settled operation states for itself: the ones the kernel
 * lifted onto the operation, the actions its recovery content names, the
 * escape its block names, and every failure its units settled with.
 */
export interface SettledRecoveries {
  readonly suggestions?: ReadonlyArray<FailureSuggestedAction>;
  readonly recovery?: ReadonlyArray<SuggestedAction>;
  readonly escape?: SuggestedAction;
  readonly failures: ReadonlyArray<{
    readonly suggestions?: ReadonlyArray<FailureSuggestedAction> | undefined;
  }>;
}

/** What a resolution states for itself, read once for both channels. */
export const resolutionRecoveries = (
  resolution: OperationResolution<unknown>,
): SettledRecoveries => ({
  ...(resolution.suggestions === undefined ? {} : { suggestions: resolution.suggestions }),
  ...(resolution.recovery === undefined ? {} : { recovery: resolution.recovery.actions }),
  ...(resolution.blocking?.escape === undefined ? {} : { escape: resolution.blocking.escape }),
  failures: unsettledUnits(resolution).flatMap((unit) =>
    unit.error === undefined ? [] : [unit.error],
  ),
});

const sameAction = (left: FailureSuggestedAction, right: FailureSuggestedAction): boolean =>
  left.description === right.description && left.cmd === right.cmd && left.url === right.url;

/**
 * The one `Next` list of a settled operation, for the machine envelope and the
 * human render alike: what the adapter offers, then every failed unit's own
 * recovery (a reader of seven failures needs all of them), then what the
 * operation states for itself, its recovery actions, and the escape its block
 * names, each once. Scope is applied afterwards, at the emit boundary.
 */
export const operationNextActions = (
  settled: SettledRecoveries,
  offered: ReadonlyArray<SuggestedAction>,
): ReadonlyArray<FailureSuggestedAction> => {
  const combined = [
    ...offered,
    ...settled.failures.flatMap((failure) => failure.suggestions ?? []),
    ...(settled.suggestions ?? []),
    ...(settled.recovery ?? []),
    ...(settled.escape === undefined ? [] : [settled.escape]),
  ];
  return combined.filter(
    (suggestion, index) => combined.findIndex((other) => sameAction(other, suggestion)) === index,
  );
};

/**
 * Terminate a plan-family invocation: derive outcome and exit, record
 * completion semantics, emit the machine document, and project the human
 * render. Returns the derivations so callers can act on them without
 * re-deriving.
 */
export const emitOperationResolution = (
  resolution: OperationResolution<unknown>,
  options?: EmitOperationResolutionOptions,
) =>
  Effect.gen(function* () {
    const verbosity = yield* Verbosity;
    const outcome = deriveOperationOutcome(resolution);
    const exitCode = operationExitCode(resolution, outcome);
    const ok = operationOk(resolution, outcome);

    const offered =
      typeof options?.suggestions === "function"
        ? options.suggestions({ outcome, unsettled: unsettledUnits(resolution) })
        : (options?.suggestions ?? []);
    const next = operationNextActions(resolutionRecoveries(resolution), offered);
    const suggestions = next.length === 0 ? undefined : yield* suggestionsForCurrentWorkspace(next);
    const scopedRoutes = yield* Effect.serviceOption(ScopedRoutes);

    const result = toPlanResolutionResult(resolution, {
      verbose: verbosity.isAtLeast("verbose"),
      debug: verbosity.level === "debug",
      ...(options?.message === undefined ? {} : { message: options.message }),
      ...(options?.imports === undefined ? {} : { imports: options.imports }),
      ...(options?.targetedUpdate === undefined ? {} : { targetedUpdate: options.targetedUpdate }),
    });

    // The category a non-success settles with, for telemetry: the operation's
    // own failure, else the first failed unit's (so a partial outcome is
    // reported), else the category the exit code pairs with (a block).
    const failedUnit = resolution.units.find((unit) => unit.error !== undefined);
    const failureCode =
      exitCode === ExitCode.Success || outcome === "interrupted"
        ? undefined
        : (result.failure?.code ?? failedUnit?.error?.category ?? appErrorCodeForExit(exitCode));
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(operationResolutionSummary(resolution)),
      ...(resolution.blocking === undefined
        ? {}
        : { "cli.blocking_class": resolution.blocking.class }),
      ...(failureCode === undefined ? {} : { "cli.error_code": failureCode }),
      ...(resolution.candidateId === undefined
        ? {}
        : { "cli.candidate_id": resolution.candidateId }),
    });
    yield* setOperationExitCode(exitCode);

    // Live-to-settled handoff: the terminal lifecycle event lands and every
    // lossless observer (frame collapse, machine writer) drains before the
    // settled document prints, so the two contracts never overlap.
    yield* settleOperation(outcome);
    yield* awaitDrained;

    yield* emitResult(
      { result },
      PlanResolutionDocumentSchema,
      () => {
        const unsettled = new Set(unsettledUnits(resolution).map((unit) => targetName(unit.label)));
        return operationDoc(resolution, {
          verbosity: verbosity.level,
          ...(suggestions === undefined ? {} : { suggestions }),
          ...Option.match(scopedRoutes, {
            onNone: () => ({}),
            onSome: ({ routes }) => ({ scopedRoutes: routes }),
          }),
          ...(options?.message === undefined ? {} : { message: options.message }),
          // A condition the operation reports stands with the ledger it is
          // about, so `Next` stays the last thing a reader sees.
          callouts: releaseAgeDoc(options?.recovery, result, { unsettled }),
        });
      },
      { ...(suggestions === undefined ? {} : { suggestions }), ok },
    );
    return { outcome, exitCode };
  });

/**
 * Terminate a plan-family invocation that planned nothing: an empty resolution
 * in the invocation's actual mode whose outcome derives `no-op`, with the
 * stated message.
 */
export const emitNoOpOperation = (args: {
  readonly mode: "preview" | "apply";
  readonly planName: string;
  readonly planDescription?: string;
  readonly message: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly withoutSuggestions?: boolean;
}) =>
  emitOperationResolution(
    makeOperationResolution({
      name: args.planName,
      description:
        args.planDescription === undefined ? Option.none() : Option.some(args.planDescription),
      mode: args.mode,
      atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
      units: [],
    }),
    {
      message: args.message,
      ...(args.suggestions === undefined ? {} : { suggestions: args.suggestions }),
      ...(args.withoutSuggestions === undefined
        ? {}
        : { withoutSuggestions: args.withoutSuggestions }),
    },
  );
