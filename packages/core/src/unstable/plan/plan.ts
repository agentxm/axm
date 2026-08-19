/**
 * Plan types for workspace operations.
 *
 * Uses a readiness-based model where each step carries its own `run` effect
 * (for ready/warn steps) or an error message (for error steps). A plan retains
 * the environment required by its executable steps so callers can compose
 * dependencies once at the command boundary.
 *
 * This module is the stable kernel home for the plan-pipeline primitives. It
 * is imported by the CLI, the lint module, and any shared-kernel consumer that
 * composes workspace Operations. The registry Worker SHALL NOT import it —
 * publish never applies fixes, so the plan pipeline tree-shakes out of the
 * Worker bundle.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AppErrorCodeSchema, type AppError, type AppErrorCode } from "../app-error/index.js";
import { ExtensionTypeSchema } from "../extensions/common.js";
import type { DeprecationView, ReleaseAgeOperationEvidence } from "../registry/index.js";
import type { SuggestedAction } from "../cli-runtime/suggested-action.js";

export const PlanPolicyIds = ["ignore-version-constraints", "accept-warnings"] as const;

export const PlanPolicyIdSchema = Schema.Literals(PlanPolicyIds);
export type PlanPolicyId = typeof PlanPolicyIdSchema.Type;

export const PlanExecutionReasonSchema = Schema.Literals([
  "approval-required",
  "override-required",
  "stale-candidate",
  "hard-blocked",
  "interrupted",
  "execution-failed",
] as const);
export type PlanExecutionReason = typeof PlanExecutionReasonSchema.Type;

export const PlanRiskConditionSchema = Schema.Union([
  Schema.Struct({
    level: Schema.Literal("confirmable"),
    id: Schema.String,
    detail: Schema.String,
  }),
  Schema.Struct({
    level: Schema.Literal("override-required"),
    id: Schema.String,
    policy: PlanPolicyIdSchema,
    requiredFlag: Schema.String,
    detail: Schema.String,
  }),
  Schema.Struct({
    level: Schema.Literal("blocked"),
    id: Schema.String,
    detail: Schema.String,
    errorCode: AppErrorCodeSchema,
  }),
]);
export type PlanRiskCondition = typeof PlanRiskConditionSchema.Type;

// -----------------------------------------------------------------------------
// Operation type
// -----------------------------------------------------------------------------

/**
 * Generic operation type used by all extension operation handlers.
 * Each operation is identified by a string name and carries typed args.
 */
export interface Operation<TName extends string, TArgs> {
  readonly name: TName;
  readonly args: TArgs;
}

// -----------------------------------------------------------------------------
// Step result types
// -----------------------------------------------------------------------------

export const ArtifactChangeSchema = Schema.Literals([
  "created",
  "updated",
  "unchanged",
  "removed",
] as const);

export type ArtifactChange = typeof ArtifactChangeSchema.Type;

export const ArtifactMechanismSchema = Schema.Literals(["symlink", "copy"] as const);
export type ArtifactMechanism = typeof ArtifactMechanismSchema.Type;

export const ConfiguredAgentOutcomeSchema = Schema.Struct({
  extensionType: ExtensionTypeSchema,
  name: Schema.String,
  agentId: Schema.String,
  outcome: Schema.Literals([
    "projected",
    "current",
    "not-applicable",
    "unsupported",
    "blocked",
    "failed",
  ] as const),
  reasonCode: Schema.String,
  reason: Schema.String,
  mechanism: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
}).annotate({
  identifier: "ConfiguredAgentOutcome",
  title: "Configured Agent Outcome",
  description: "Effective lifecycle result for one configured agent and extension.",
});

export type ConfiguredAgentOutcome = typeof ConfiguredAgentOutcomeSchema.Type;

export interface JobStepArtifact {
  readonly path: string;
  readonly scope: "project" | "user";
  readonly agents?: ReadonlyArray<string>;
  readonly version?: string;
  readonly change: ArtifactChange;
  readonly mechanism?: ArtifactMechanism;
  readonly previousVersion?: string;
  readonly fileCount?: number;
  readonly targets?: ReadonlyArray<JobStepArtifactTarget>;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
  readonly source?: JobStepArtifactSource;
  readonly managedRegions?: ReadonlyArray<JobStepManagedRegion>;
  /** Registry lifecycle evidence captured when the candidate was resolved. */
  readonly registryLifecycle?: { readonly deprecation: DeprecationView };
}

export interface JobStepManagedRegion {
  readonly unitId: string;
  readonly path: string;
  readonly owner: string;
}

export interface JobStepArtifactTarget {
  readonly path: string;
  readonly change: ArtifactChange;
  readonly agentIds?: ReadonlyArray<string>;
}

export interface JobStepArtifactSource {
  readonly type: string;
  readonly origin: string;
  readonly ref?: string;
  readonly directory?: string;
  readonly gitTreeHash?: string;
}

export interface RegistryLifecycleEvidence {
  readonly deprecation: DeprecationView;
}

export type JobStepResult<Output = never> =
  | {
      readonly result: "success";
      readonly message: string;
      readonly warnings?: ReadonlyArray<string>;
      readonly links?: { readonly html: string };
      readonly artifact?: JobStepArtifact;
      readonly output?: Output;
    }
  | {
      readonly result: "error";
      readonly message: string;
      readonly error: AppError;
    };

// -----------------------------------------------------------------------------
// Planned step types (readiness-based discriminated union)
// -----------------------------------------------------------------------------

export interface ReadyJobStep<Requirements = never, Output = never> {
  readonly key?: string;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly readiness: "ready";
  readonly label: string;
  readonly message?: string;
  readonly artifact?: JobStepArtifact;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
  readonly registryLifecycle?: RegistryLifecycleEvidence;
  readonly run: Effect.Effect<JobStepResult<Output>, AppError, Requirements>;
}

export interface WarnJobStep<Requirements = never, Output = never> {
  readonly key?: string;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly readiness: "warn";
  readonly warnMessage: string;
  readonly label: string;
  readonly artifact?: JobStepArtifact;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
  readonly registryLifecycle?: RegistryLifecycleEvidence;
  readonly run: Effect.Effect<JobStepResult<Output>, AppError, Requirements>;
}

export interface ErrorJobStep {
  readonly key?: string;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly readiness: "error";
  readonly errorMessage: string;
  readonly label: string;
  readonly artifact?: JobStepArtifact;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
  readonly registryLifecycle?: RegistryLifecycleEvidence;
  /** Semantic blockers already represented in Plan.riskConditions. */
  readonly blockingConditionIds?: ReadonlyArray<string>;
}

export type PlannedJobStep<Requirements = never, Output = never> =
  ReadyJobStep<Requirements, Output> | WarnJobStep<Requirements, Output> | ErrorJobStep;

// -----------------------------------------------------------------------------
// Completed step type (after execution)
// -----------------------------------------------------------------------------

export interface CompletedJobStep<Output = never> {
  readonly key?: string;
  readonly label: string;
  readonly blockedBy?: ReadonlyArray<string>;
  readonly registryLifecycle?: RegistryLifecycleEvidence;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
  readonly result: JobStepResult<Output>;
}

// -----------------------------------------------------------------------------
// Job and Plan types
// -----------------------------------------------------------------------------

export type JobExecutionPolicy = "fail-fast" | "best-effort";

export interface Job<Requirements = never, Output = never> {
  readonly steps: ReadonlyArray<PlannedJobStep<Requirements, Output>>;
  readonly concurrency: "unbounded" | number;
  /**
   * Defaults to ordered fail-fast execution. Use `best-effort` only when every
   * sibling step is independent; a failure still blocks subsequent jobs.
   */
  readonly executionPolicy?: JobExecutionPolicy;
}

/**
 * An additional labeled section to display alongside a plan.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PlanSection {
  readonly title: string;
  readonly items: ReadonlyArray<string>;
}

export const OperationPreconditionSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  status: Schema.Literals(["met", "unmet"] as const),
  detail: Schema.optional(Schema.String),
  blockedOn: Schema.optional(Schema.Literal("human")),
  command: Schema.optional(Schema.String),
}).annotate({
  identifier: "OperationPrecondition",
  title: "Operation Precondition",
  description: "A condition that must be satisfied before an operation can apply.",
});

export type OperationPrecondition = typeof OperationPreconditionSchema.Type;

export interface Plan<Requirements = never, Output = never> {
  readonly _tag: "Plan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job<Requirements, Output>>;
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  /** Optional extra sections rendered after the plan steps. */
  readonly sections?: ReadonlyArray<PlanSection>;
  /** Semantic conditions evaluated by the shared execution-policy boundary. */
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition>;
  /** Recovery specific to an operation that cannot currently be applied. */
  readonly failureSuggestions?: ReadonlyArray<SuggestedAction>;
  /** Persisted inputs outside workspace state that materially determine this plan. */
  readonly materialPaths?: ReadonlyArray<string>;
  /** Local plans roll back candidate-wide; remote effects report truthful partial outcomes. */
  readonly executionCapabilities?: {
    readonly rollback: "local-atomic" | "non-rollbackable";
  };
}

// -----------------------------------------------------------------------------
// Executed plan types (after apply)
// -----------------------------------------------------------------------------

export interface ExecutedJob<Output = never> {
  readonly steps: ReadonlyArray<CompletedJobStep<Output>>;
  readonly concurrency: "unbounded" | number;
  readonly executionPolicy?: JobExecutionPolicy;
}

export interface ExecutedPlan<Output = never> {
  readonly _tag: "ExecutedPlan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<ExecutedJob<Output>>;
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition>;
  readonly candidateId?: string;
}

export interface PreviewedPlan<Requirements = never, Output = never> {
  readonly _tag: "PreviewedPlan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job<Requirements, Output>>;
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition>;
  readonly candidateId?: string;
}

export interface CancelledPlan<Requirements = never, Output = never> {
  readonly _tag: "CancelledPlan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job<Requirements, Output>>;
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition>;
  readonly candidateId?: string;
}

export interface FailedPlan<Requirements = never, Output = never> {
  readonly _tag: "FailedPlan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job<Requirements, Output>>;
  readonly releaseAge?: ReleaseAgeOperationEvidence;
  readonly reason: PlanExecutionReason;
  readonly errorCode: AppErrorCode;
  readonly failure?: AppError;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition>;
  readonly candidateId?: string;
  readonly executionSteps?: ReadonlyArray<{
    readonly label: string;
    readonly status: "rolled-back" | "unapplied" | "failed";
    readonly message: string;
  }>;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

export type PlanResolution<Requirements = never, Output = never> =
  | ExecutedPlan<Output>
  | PreviewedPlan<Requirements, Output>
  | CancelledPlan<Requirements, Output>
  | FailedPlan<Requirements, Output>;
