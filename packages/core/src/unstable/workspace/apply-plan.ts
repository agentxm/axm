/**
 * Shared plan apply module.
 *
 * Iterates over plan jobs and their steps, executing `step.run()` for
 * ready/warn steps and promoting error steps to error results without
 * execution. Preserves inter-job blocking and intra-job continuation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { makeAppError, type AppError } from "../app-error/index.js";
import type {
  CompletedJobStep,
  ExecutedPlan,
  OperationResult,
  Plan,
  PlannedJobStep,
} from "./plan.js";

// -----------------------------------------------------------------------------
// Legacy types (used by non-migrated operation handlers)
// These will be removed in a future phase.
// -----------------------------------------------------------------------------

/** @deprecated Will be removed in a future phase. */
export type OperationHandler<Op, R = never> = (
  op: Op,
) => Effect.Effect<OperationResult, AppError, R>;

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const executeStep = (step: PlannedJobStep): Effect.Effect<CompletedJobStep, never, never> => {
  switch (step.readiness) {
    case "error":
      return Effect.succeed({
        label: step.label,
        result: {
          result: "error",
          message: step.errorMessage,
          error: makeAppError({
            code: "PLAN_STEP_ERROR",
            what: step.errorMessage,
          }),
        },
      });

    case "ready":
    case "warn":
      return step.run.pipe(
        Effect.map(
          (result): CompletedJobStep => ({
            label: step.label,
            result,
          }),
        ),
        Effect.catch((error): Effect.Effect<CompletedJobStep> => {
          const detailSuffix = error.details.length > 0 ? ` | ${error.details.join(" | ")}` : "";
          return Effect.succeed({
            label: step.label,
            result: {
              result: "error",
              message: `${error.what} (${error.code})${detailSuffix}`,
              error,
            },
          });
        }),
      );
  }
};

const blockStep = (step: PlannedJobStep): CompletedJobStep => ({
  label: step.label,
  result: {
    result: "error",
    message: "blocked by earlier job failure",
    error: makeAppError({
      code: "PLAN_STEP_BLOCKED",
      what: "blocked by earlier job failure",
    }),
  },
});

/**
 * Apply a plan by iterating jobs and executing step run closures.
 *
 * Ready and warn steps are executed via `step.run()`; error steps are
 * promoted to error results. Inter-job blocking: if any step in job N
 * produces an error result, subsequent jobs are blocked. Intra-job
 * continuation: sibling steps in the same job continue executing.
 *
 * Never fails — catches AppError and converts to error results.
 */
export const applyPlan = (plan: Plan): Effect.Effect<ExecutedPlan, never, never> =>
  Effect.gen(function* () {
    let blocked = false;
    const jobResults = yield* Effect.forEach(
      plan.jobs,
      (job) =>
        blocked
          ? Effect.succeed(job.steps.map((step) => blockStep(step)))
          : Effect.forEach(job.steps, (step) => executeStep(step), {
              concurrency: job.concurrency,
            }).pipe(
              Effect.tap((steps) => {
                if (steps.some((step) => step.result.result === "error")) {
                  blocked = true;
                }
                return Effect.void;
              }),
            ),
      { concurrency: 1 },
    );

    return {
      _tag: "ExecutedPlan",
      name: plan.name,
      description: plan.description,
      jobs: Array.map(jobResults, (steps, i) => ({
        concurrency: plan.jobs[i]?.concurrency ?? 1,
        steps,
      })),
    } satisfies ExecutedPlan;
  }).pipe(Effect.withSpan("Workspace.applyPlan"));
