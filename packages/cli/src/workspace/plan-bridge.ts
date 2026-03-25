/**
 * Bridge module for converting legacy operation-based plan construction
 * to the new readiness-based model with run closures.
 *
 * This is a temporary compatibility layer that will be removed as each
 * command handler is migrated to the new plan model.
 *
 * @internal
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { JobStepResult, Plan, PlannedJobStep } from "./plan.js";
import type { OperationResult } from "./plan.js";

/**
 * Legacy step definition used by non-migrated plan builders.
 */
export interface LegacyPlannedStep<TOperation> {
  readonly _tag: "PlannedJobStep";
  readonly operation: TOperation;
  readonly readiness:
    | { readonly status: "ready"; readonly message: import("effect/Option").Option<string> }
    | { readonly status: "skip"; readonly message: string }
    | { readonly status: "warn"; readonly message: string }
    | { readonly status: "error"; readonly message: string };
  readonly label: string;
}

/**
 * Legacy plan definition used by non-migrated plan builders.
 */
export interface LegacyPlan<TOperation> {
  readonly name: string;
  readonly description: import("effect/Option").Option<string>;
  readonly jobs: ReadonlyArray<{
    readonly steps: ReadonlyArray<LegacyPlannedStep<TOperation>>;
    readonly concurrency: "unbounded" | 1;
  }>;
}

/**
 * Convert a legacy plan with handler map to a new-style Plan with run closures.
 *
 * Each legacy step's operation is dispatched to the matching handler by name.
 * The handler's OperationResult is converted to JobStepResult.
 */
export const bridgeLegacyPlan = <
  Op extends { readonly name: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends Record<string, (op: any) => Effect.Effect<OperationResult, AppError, any>>,
>(
  legacyPlan: LegacyPlan<Op>,
  handlers: T,
): Plan => ({
  _tag: "Plan",
  name: legacyPlan.name,
  description: legacyPlan.description,
  jobs: legacyPlan.jobs.map((job) => ({
    concurrency: job.concurrency,
    steps: job.steps.map((step): PlannedJobStep => {
      switch (step.readiness.status) {
        case "skip":
          // Skip steps become ready no-op steps
          return {
            readiness: "ready",
            label: step.label,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              message: step.readiness.message,
            }),
          };
        case "error":
          return {
            readiness: "error",
            errorMessage: step.readiness.message,
            label: step.label,
          };
        case "warn": {
          const handler = handlers[step.operation.name as keyof T];
          if (!handler) {
            return {
              readiness: "error",
              errorMessage: `No handler for operation: ${step.operation.name}`,
              label: step.label,
            };
          }
          return {
            readiness: "warn",
            warnMessage: step.readiness.message,
            label: step.label,
            run: (handler as (op: Op) => Effect.Effect<OperationResult, AppError, never>)(
              step.operation,
            ).pipe(Effect.map(toJobStepResult)),
          };
        }
        case "ready": {
          const handler = handlers[step.operation.name as keyof T];
          if (!handler) {
            return {
              readiness: "error",
              errorMessage: `No handler for operation: ${step.operation.name}`,
              label: step.label,
            };
          }
          return {
            readiness: "ready",
            label: step.label,
            run: (handler as (op: Op) => Effect.Effect<OperationResult, AppError, never>)(
              step.operation,
            ).pipe(Effect.map(toJobStepResult)),
          };
        }
      }
    }),
  })),
});

/**
 * Legacy step builder for non-migrated plan constructors.
 *
 * Creates a LegacyPlannedStep with ready or skip readiness based on the
 * `isReady` flag. Used by plan builders that haven't been migrated to
 * inline run closures yet.
 *
 * @deprecated Use inline readiness-based step construction instead.
 */
export const makeLegacyStep = <TOperation>(
  operation: TOperation,
  label: string,
  isReady: boolean,
  skipMessage: string,
): LegacyPlannedStep<TOperation> => ({
  _tag: "PlannedJobStep",
  operation,
  readiness: isReady
    ? { status: "ready", message: Option.none() }
    : { status: "skip", message: skipMessage },
  label,
});

const toJobStepResult = (result: OperationResult): JobStepResult =>
  result.result === "error"
    ? { result: "error", message: result.message, error: result.error }
    : { result: "success", message: result.message };
