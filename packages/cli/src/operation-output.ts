/**
 * Plan-family machine document (`plan-result-v3`) and the emit boundary.
 *
 * `emitOperationResolution` is the one place a plan-family command terminates:
 * it derives the outcome and exit code from the resolution with the shared
 * pure derivations, records completion semantics for telemetry, emits the
 * machine document, and projects the human render. No channel re-derives its
 * own account of what happened.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import {
  SuggestedActionSchema,
  setCommandSemanticProperties,
  getCommandSemanticProperties,
  setOperationExitCode,
  summarizeCommandOutcome,
  type CommandOutcomeSummary,
  type SourceKind,
  type SubjectType,
  type SuggestedAction,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  ArtifactChangeSchema,
  ArtifactMechanismSchema,
  AtomicityClassSchema,
  BlockingClassSchema,
  ConfiguredAgentOutcomeSchema,
  OperationOutcomeSchema,
  OperationPhaseSchema,
  OperationPreconditionSchema,
  PlanRiskConditionSchema,
  UnitDispositionSchema,
  UnitStateSchema,
  countUnitStates,
  deriveOperationOutcome,
  makeOperationResolution,
  operationExitCode,
  operationOk,
  unitsByStableIdentity,
  type JobStepArtifact,
  type OperationOutcome,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/client-core/unstable/plan";
import {
  AppErrorCodeSchema,
  redactSensitiveText,
  serializeErrorCauseChain,
} from "@agentxm/client-core/unstable/app-error";
import { formatMinimumReleaseAgeSeconds } from "@agentxm/client-core/unstable/registry";
import { DeprecationViewSchema } from "@agentxm/client-core/unstable/registry";
import { CatalogExtensionTypeSchema } from "@agentxm/client-core/unstable/extension-types";

import { renderOperationOutcome, resolutionAgentCoverage } from "./operation-render.js";
import { suggestionsForCurrentWorkspace } from "./root/shared/scoped-command.js";
import type { TargetedUpdatePublicContext } from "./root/update/targeted-update-context.js";

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
  agentOutcomes: Schema.optional(Schema.Array(ConfiguredAgentOutcomeSchema)),
  source: Schema.optional(StepArtifactSourceSchema),
  managedRegions: Schema.optional(Schema.Array(StepManagedRegionSchema)),
  registryLifecycle: Schema.optional(
    Schema.Struct({
      deprecation: DeprecationViewSchema,
    }),
  ),
}).annotate({
  identifier: "StepArtifact",
  title: "Plan Step Artifact",
  description: "Optional artifact metadata describing what changed and where.",
});
type StepArtifact = typeof StepArtifactSchema.Type;

const ErrorCauseSchema = Schema.Struct({
  _tag: Schema.String,
  code: Schema.optional(Schema.String),
  message: Schema.String,
  stack: Schema.optional(Schema.String),
}).annotate({
  identifier: "ErrorCause",
  title: "Error Cause",
  description: "One serialized entry from a failed step error cause chain.",
});

const OperationFailureSchema = Schema.Struct({
  code: AppErrorCodeSchema,
  message: Schema.String,
  causes: Schema.optional(Schema.Array(ErrorCauseSchema)),
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
      deprecation: DeprecationViewSchema,
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
      source: Schema.Literals(["inline", "registry", "workspace"] as const),
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
  const { targets, source, managedRegions, ...base } = artifact;
  const sanitizedBase = {
    ...base,
    ...(base.path === undefined ? {} : { path: redactSensitiveText(base.path) }),
    ...(managedRegions === undefined
      ? {}
      : {
          managedRegions: managedRegions.map((region) => ({
            ...region,
            path: redactSensitiveText(region.path),
          })),
        }),
  };
  const sanitizedSource =
    source === undefined
      ? undefined
      : {
          ...source,
          origin: redactSensitiveText(source.origin),
          ...(source.ref === undefined ? {} : { ref: redactSensitiveText(source.ref) }),
        };
  const rest =
    options.debug === true && sanitizedSource !== undefined
      ? { ...sanitizedBase, source: sanitizedSource }
      : sanitizedBase;
  if (targets === undefined) return rest;
  const additionalTargets = artifact.targets?.filter((target) => target.path !== artifact.path);
  return additionalTargets === undefined || additionalTargets.length === 0
    ? rest
    : {
        ...rest,
        targets: additionalTargets.map((target) => ({
          ...target,
          path: redactSensitiveText(target.path),
        })),
      };
};

const unitForJson = (unit: ResolvedUnit<unknown>, options: PlanResolutionResultOptions): Unit => {
  const includeErrorDetails = options.verbose === true || options.debug === true;
  const causes =
    unit.error !== undefined && includeErrorDetails
      ? serializeErrorCauseChain(unit.error.cause, { debug: options.debug === true })
      : [];
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
            detail: redactSensitiveText(unit.blocking.detail),
          },
        }),
    ...(unit.message === undefined || unit.message.length === 0
      ? {}
      : { message: redactSensitiveText(unit.message) }),
    ...(unit.warnings === undefined || unit.warnings.length === 0
      ? {}
      : { warnings: unit.warnings.map((warning) => redactSensitiveText(warning)) }),
    ...(unit.error === undefined ? {} : { code: unit.error.code }),
    ...(unit.error !== undefined && includeErrorDetails
      ? {
          error: {
            code: unit.error.code,
            message: redactSensitiveText(unit.error.detail),
            ...(causes.length > 0 ? { causes } : {}),
          },
        }
      : {}),
    ...(unit.artifact === undefined ? {} : { artifact: artifactForJson(unit.artifact, options) }),
    ...(unit.agentOutcomes === undefined ? {} : { agentOutcomes: unit.agentOutcomes }),
    ...(unit.registryLifecycle === undefined ? {} : { registryLifecycle: unit.registryLifecycle }),
    ...(unit.links === undefined ? {} : { links: { html: redactSensitiveText(unit.links.html) } }),
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
            detail: redactSensitiveText(resolution.blocking.detail),
          },
        }),
    ...(resolution.failure === undefined
      ? {}
      : {
          failure: {
            code: resolution.failure.code,
            message: redactSensitiveText(resolution.failure.detail),
            ...(options.verbose === true || options.debug === true
              ? {
                  causes: serializeErrorCauseChain(resolution.failure.cause, {
                    debug: options.debug === true,
                  }),
                }
              : {}),
          },
        }),
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
            path: redactSensitiveText(entry.path),
          })),
        }),
    ...(resolution.recovery === undefined
      ? {}
      : {
          recovery: {
            ...resolution.recovery,
            retained: resolution.recovery.retained.map((path) => redactSensitiveText(path)),
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

const releaseAgeRequiredBy = (record: ReleaseAgeRecordView): string => {
  const root = record.dependencyPath[0];
  return root === undefined || root === record.target ? "" : ` (required by ${root})`;
};

const releaseAgeExemption = (record: ReleaseAgeRecordView): string =>
  record.bypassCause === "exclude"
    ? `exempt via minimumReleaseAgeExclude in ${record.exemptionScope ?? "unknown"} settings`
    : "exempt via --ignore-release-age (this run only)";

const releaseAgeHoldbackLine = (record: ReleaseAgeRecordView): string => {
  const kept = record.selectedVersion ?? record.currentVersion;
  const held = `${record.candidateVersion}${releaseAgeRequiredBy(record)} published ${record.publishedAt}, eligible ${record.eligibleAt}`;
  return kept === undefined
    ? `${record.target} ${held}`
    : `${record.target} kept at ${kept} — ${held}`;
};

const releaseAgeBypassLine = (record: ReleaseAgeRecordView): string =>
  `Selected ${record.target} ${record.candidateVersion}${releaseAgeRequiredBy(record)} ahead of its eligibility at ${record.eligibleAt} (published ${record.publishedAt}) — ${releaseAgeExemption(record)}`;

const renderReleaseAgeEvidence = (result: PlanResolutionResult) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (result.holdbacks !== undefined && result.holdbacks.length > 0) {
      const holdbacks = result.holdbacks;
      yield* renderer.warn(
        `${count(holdbacks.length, "newer release")} held by the ${releaseAgeWindowLabel(holdbacks)}`,
      );
      for (const holdback of holdbacks) {
        yield* renderer.info(releaseAgeHoldbackLine(holdback));
      }
      const targets = Array.from(
        new Set(holdbacks.map((holdback) => holdback.dependencyPath[0] ?? holdback.target)),
      );
      yield* renderer.info(
        `Wait for the eligible time, pin an eligible version, or change minimumReleaseAge in settings.${
          targets.length === 1
            ? ` To take it now for this run only, run axm update ${targets[0]} --ignore-release-age.`
            : " To take one now for this run only, run axm update <extension[@version]> --ignore-release-age."
        }`,
      );
    }
    if (result.releaseAgeBypasses !== undefined && result.releaseAgeBypasses.length > 0) {
      const bypasses = result.releaseAgeBypasses;
      yield* renderer.warn(
        `${count(bypasses.length, "release")} skipped the ${releaseAgeWindowLabel(bypasses)}`,
      );
      for (const bypass of bypasses) {
        yield* renderer.info(releaseAgeBypassLine(bypass));
      }
    }
  });

// -----------------------------------------------------------------------------
// The emit boundary
// -----------------------------------------------------------------------------

export interface EmitOperationResolutionOptions {
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
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
 * Terminate a plan-family invocation: derive outcome and exit, record
 * completion semantics, emit the machine document, and project the human
 * render. Returns the derivations so callers can act on them without
 * re-deriving.
 */
export const emitOperationResolution = (
  command: string,
  resolution: OperationResolution<unknown>,
  options?: EmitOperationResolutionOptions,
) =>
  Effect.gen(function* () {
    void command;
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const outcome = deriveOperationOutcome(resolution);
    const exitCode = operationExitCode(resolution, outcome);
    const ok = operationOk(resolution, outcome);

    const combinedSuggestions = [
      ...(options?.suggestions ?? []),
      ...(resolution.suggestions ?? []),
      ...(resolution.blocking?.escape === undefined ? [] : [resolution.blocking.escape]),
    ];
    const deduped = combinedSuggestions.filter(
      (suggestion, index) =>
        combinedSuggestions.findIndex(
          (other) => other.description === suggestion.description && other.cmd === suggestion.cmd,
        ) === index,
    );
    const suggestions =
      deduped.length === 0 ? undefined : yield* suggestionsForCurrentWorkspace(deduped);

    const result = toPlanResolutionResult(resolution, {
      verbose: verbosity.isAtLeast("verbose"),
      debug: verbosity.level === "debug",
      ...(options?.message === undefined ? {} : { message: options.message }),
      ...(options?.imports === undefined ? {} : { imports: options.imports }),
      ...(options?.targetedUpdate === undefined ? {} : { targetedUpdate: options.targetedUpdate }),
    });

    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(operationResolutionSummary(resolution)),
      ...(resolution.blocking === undefined
        ? {}
        : { "cli.blocking_class": resolution.blocking.class }),
      ...(result.failure === undefined ? {} : { "cli.error_code": result.failure.code }),
      ...(resolution.candidateId === undefined
        ? {}
        : { "cli.candidate_id": resolution.candidateId }),
    });
    yield* setOperationExitCode(exitCode);

    const emitted = yield* renderer.result({ result }, PlanResolutionDocumentSchema, {
      ...(suggestions === undefined ? {} : { suggestions }),
      ok,
    });
    if (!emitted) {
      yield* renderOperationOutcome(resolution, {
        ...(suggestions === undefined ? {} : { suggestions }),
        ...(options?.message === undefined ? {} : { message: options.message }),
      });
      yield* renderReleaseAgeEvidence(result);
    }
    return { outcome, exitCode, emitted };
  });

/**
 * Terminate a plan-family invocation that planned nothing: an empty resolution
 * in the invocation's actual mode whose outcome derives `no-op`, with the
 * stated message.
 */
export const emitNoOpOperation = (
  command: string,
  args: {
    readonly mode: "preview" | "apply";
    readonly planName: string;
    readonly planDescription?: string;
    readonly message: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  emitOperationResolution(
    command,
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
