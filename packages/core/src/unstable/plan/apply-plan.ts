/**
 * Shared plan apply module.
 *
 * Iterates over plan jobs and their steps, executing `step.run()` for
 * ready/warn steps and promoting error steps to error results without
 * execution. Preserves inter-job blocking and intra-job continuation.
 *
 * This module is the stable kernel home for `applyPlan` and the
 * `OperationHandler` type. Per-extension handlers (`install-skill`,
 * `uninstall-skill`, `enable-skill`, `disable-skill`, `install-pack`,
 * `uninstall-pack`, `install-command`, `uninstall-command`, `enable-command`,
 * `disable-command`, `install-mcp-server`, `uninstall-mcp-server`,
 * `enable-subagent`, `disable-subagent`) live in their domain packages under
 * `../{skills,packs,commands,mcps,subagents}/operations/*` and resolve
 * from this location.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { makeAppError, type AppError } from "../app-error/index.js";
import type {
  CompletedJobStep,
  ExecutedPlan,
  JobStepResult,
  Plan,
  PlannedJobStep,
  WarnJobStep,
} from "./plan.js";

// -----------------------------------------------------------------------------
// Operation handler type
// -----------------------------------------------------------------------------

/**
 * Type for operation handler functions that take an operation and return
 * an Effect producing a JobStepResult.
 */
export type OperationHandler<Op, R = never> = (op: Op) => Effect.Effect<JobStepResult, AppError, R>;

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const appendReadinessWarning = (step: WarnJobStep, result: JobStepResult): JobStepResult => {
  if (result.result === "error") {
    return result;
  }

  return {
    ...result,
    warnings: [...(result.warnings ?? []), step.warnMessage],
  };
};

const errorStepMessage = (error: AppError): string => `${error.detail} (${error.code})`;

const executeStep = (step: PlannedJobStep): Effect.Effect<CompletedJobStep, never, never> => {
  switch (step.readiness) {
    case "error":
      return Effect.succeed({
        label: step.label,
        result: {
          result: "error",
          message: step.errorMessage,
          error: makeAppError({
            code: "internal",
            detail: step.errorMessage,
          }),
        },
      });

    case "ready":
      return step.run.pipe(
        Effect.map((result): CompletedJobStep => ({
          label: step.label,
          result,
        })),
        Effect.catch((error): Effect.Effect<CompletedJobStep> => {
          return Effect.succeed({
            label: step.label,
            result: {
              result: "error",
              message: errorStepMessage(error),
              error,
            },
          });
        }),
      );

    case "warn":
      return step.run.pipe(
        Effect.map((result): CompletedJobStep => ({
          label: step.label,
          result: appendReadinessWarning(step, result),
        })),
        Effect.catch((error): Effect.Effect<CompletedJobStep> => {
          return Effect.succeed({
            label: step.label,
            result: {
              result: "error",
              message: errorStepMessage(error),
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
      code: "conflict",
      detail: "blocked by earlier job failure",
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
      ...(plan.preconditions === undefined ? {} : { preconditions: plan.preconditions }),
      jobs: Array.map(jobResults, (steps, i) => ({
        concurrency: plan.jobs[i]?.concurrency ?? 1,
        steps,
      })),
    } satisfies ExecutedPlan;
  }).pipe(Effect.withSpan("Plan.applyPlan"));
