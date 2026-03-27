/**
 * Plan types for workspace operations.
 *
 * Uses a readiness-based model where each step carries its own `run` closure
 * (for ready/warn steps) or an error message (for error steps). Plans and jobs
 * are non-generic; operation-specific details are captured in step closures.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { AppError } from "../app-error/index.js";

// -----------------------------------------------------------------------------
// Legacy types (used by non-migrated operation handlers)
// These will be removed in a future phase.
// -----------------------------------------------------------------------------

/** @deprecated Use inline types instead. Will be removed in a future phase. */
export interface Operation<TName extends string, TArgs> {
  readonly name: TName;
  readonly args: TArgs;
}

/** @deprecated Use JobStepResult instead. Will be removed in a future phase. */
export type OperationResult =
  | {
      readonly result: "no-op" | "success";
      readonly message: string;
    }
  | {
      readonly result: "error";
      readonly message: string;
      readonly error: AppError;
    };

// -----------------------------------------------------------------------------
// Step result types
// -----------------------------------------------------------------------------

export type JobStepResult =
  | {
      readonly result: "success";
      readonly message: string;
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
  readonly readiness: "ready";
  readonly label: string;
  readonly run: Effect.Effect<JobStepResult, AppError, never>;
}

export interface WarnJobStep {
  readonly readiness: "warn";
  readonly warnMessage: string;
  readonly label: string;
  readonly run: Effect.Effect<JobStepResult, AppError, never>;
}

export interface ErrorJobStep {
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
  readonly concurrency: "unbounded" | 1;
}

export interface Plan {
  readonly _tag: "Plan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job>;
}

// -----------------------------------------------------------------------------
// Executed plan types (after apply)
// -----------------------------------------------------------------------------

export interface ExecutedJob {
  readonly steps: ReadonlyArray<CompletedJobStep>;
  readonly concurrency: "unbounded" | 1;
}

export interface ExecutedPlan {
  readonly _tag: "ExecutedPlan";
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<ExecutedJob>;
}
