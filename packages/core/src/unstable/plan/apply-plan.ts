/**
 * Shared plan apply module.
 *
 * Iterates over plan jobs and their steps, executing `step.run()` for
 * ready/warn steps and promoting error steps to error results without
 * execution. Readiness errors gate the entire plan before any mutation, and
 * jobs fail fast unless they explicitly opt into best-effort execution.
 *
 * This module is the stable kernel home for `applyPlan` and the
 * `OperationHandler` type. Per-extension handlers live in their owning domain
 * packages and resolve this shared contract from here.
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
  Job,
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

const blockStep = (step: PlannedJobStep, message: string): CompletedJobStep => ({
  label: step.label,
  result: {
    result: "error",
    message,
    error: makeAppError({
      code: "conflict",
      detail: message,
    }),
  },
});

const applyReadinessGate = (plan: Plan): ReadonlyArray<ReadonlyArray<CompletedJobStep>> =>
  plan.jobs.map((job) =>
    job.steps.map((step) =>
      step.readiness === "error"
        ? {
            label: step.label,
            result: {
              result: "error",
              message: step.errorMessage,
              error: makeAppError({ code: "conflict", detail: step.errorMessage }),
            },
          }
        : blockStep(step, "blocked by plan readiness error"),
    ),
  );

const executeFailFastJob = (job: Job): Effect.Effect<ReadonlyArray<CompletedJobStep>> =>
  Effect.gen(function* () {
    const completed: CompletedJobStep[] = [];
    let failed = false;
    for (const step of job.steps) {
      if (failed) {
        completed.push(blockStep(step, "blocked by earlier step failure"));
        continue;
      }
      const result = yield* executeStep(step);
      completed.push(result);
      failed = result.result.result === "error";
    }
    return completed;
  });

const executeBestEffortJob = (job: Job): Effect.Effect<ReadonlyArray<CompletedJobStep>> =>
  Effect.forEach(job.steps, (step) => executeStep(step), {
    concurrency: job.concurrency,
  });

/**
 * Apply a plan by iterating jobs and executing step run closures.
 *
 * Any readiness error gates the complete plan before execution. At runtime,
 * jobs use ordered fail-fast execution by default. A job may explicitly opt
 * into best-effort execution for independent siblings; failures still block
 * all subsequent jobs.
 *
 * Never fails — catches AppError and converts to error results.
 */
export const applyPlan = (plan: Plan): Effect.Effect<ExecutedPlan, never, never> =>
  Effect.gen(function* () {
    const hasReadinessError = plan.jobs.some((job) =>
      job.steps.some((step) => step.readiness === "error"),
    );
    let blocked = false;
    const jobResults = hasReadinessError
      ? applyReadinessGate(plan)
      : yield* Effect.forEach(
          plan.jobs,
          (job) =>
            blocked
              ? Effect.succeed(
                  job.steps.map((step) => blockStep(step, "blocked by earlier job failure")),
                )
              : (job.executionPolicy === "best-effort"
                  ? executeBestEffortJob(job)
                  : executeFailFastJob(job)
                ).pipe(
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
        ...(plan.jobs[i]?.executionPolicy === undefined
          ? {}
          : { executionPolicy: plan.jobs[i].executionPolicy }),
        steps,
      })),
    } satisfies ExecutedPlan;
  }).pipe(Effect.withSpan("Plan.applyPlan"));
