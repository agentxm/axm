/**
 * Plan types for workspace operations.
 *
 * Uses a readiness-based model where each step carries its own `run` closure
 * (for ready/warn steps) or an error message (for error steps). Plans and jobs
 * are non-generic; operation-specific details are captured in step closures.
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
import type { AppError } from "../app-error/index.js";

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

export interface JobStepArtifact {
  readonly path: string;
  readonly scope: "project" | "user";
  readonly agents?: ReadonlyArray<string>;
  readonly version?: string;
  readonly change: ArtifactChange;
  readonly previousVersion?: string;
  readonly fileCount?: number;
  readonly targets?: ReadonlyArray<JobStepArtifactTarget>;
  readonly source?: JobStepArtifactSource;
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

export type JobStepResult =
  | {
      readonly result: "success";
      readonly message: string;
      readonly warnings?: ReadonlyArray<string>;
      readonly links?: { readonly html: string };
      readonly artifact?: JobStepArtifact;
    }
  | {
      readonly result: "error";
      readonly message: string;
      readonly error: AppError;
    };

// -----------------------------------------------------------------------------
// Planned step types (readiness-based discriminated union)
// -----------------------------------------------------------------------------

export interface ReadyJobStep {
  readonly key?: string;
  readonly readiness: "ready";
  readonly label: string;
  readonly message?: string;
  readonly run: Effect.Effect<JobStepResult, AppError, never>;
}

export interface WarnJobStep {
  readonly key?: string;
  readonly readiness: "warn";
  readonly warnMessage: string;
  readonly label: string;
  readonly run: Effect.Effect<JobStepResult, AppError, never>;
}

export interface ErrorJobStep {
  readonly key?: string;
  readonly readiness: "error";
  readonly errorMessage: string;
  readonly label: string;
}

export type PlannedJobStep = ReadyJobStep | WarnJobStep | ErrorJobStep;

// -----------------------------------------------------------------------------
// Completed step type (after execution)
// -----------------------------------------------------------------------------

export interface CompletedJobStep {
  readonly label: string;
  readonly result: JobStepResult;
}

// -----------------------------------------------------------------------------
// Job and Plan types (non-generic)
// -----------------------------------------------------------------------------

export interface Job {
  readonly steps: ReadonlyArray<PlannedJobStep>;
  readonly concurrency: "unbounded" | number;
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

export interface Plan {
  readonly _tag: "Plan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job>;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  /** Optional extra sections rendered after the plan steps. */
  readonly sections?: ReadonlyArray<PlanSection>;
}

// -----------------------------------------------------------------------------
// Executed plan types (after apply)
// -----------------------------------------------------------------------------

export interface ExecutedJob {
  readonly steps: ReadonlyArray<CompletedJobStep>;
  readonly concurrency: "unbounded" | number;
}

export interface ExecutedPlan {
  readonly _tag: "ExecutedPlan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<ExecutedJob>;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
}

export interface PreviewedPlan {
  readonly _tag: "PreviewedPlan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job>;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
}

export interface CancelledPlan {
  readonly _tag: "CancelledPlan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job>;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
}

export type PlanResolution = ExecutedPlan | PreviewedPlan | CancelledPlan;
