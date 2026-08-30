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
  UnitBlocking,
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

const appendReadinessWarning = <Output>(
  step: WarnJobStep<unknown, Output>,
  result: JobStepResult<Output>,
): JobStepResult<Output> => {
  if (result.result === "error") {
    return result;
  }

  return {
    ...result,
    warnings: [...(result.warnings ?? []), step.warnMessage],
  };
};

const errorStepMessage = (error: AppError): string => `${error.detail} (${error.code})`;

const stepEvidence = (step: PlannedJobStep<unknown, unknown>) => ({
  ...(step.registryLifecycle === undefined ? {} : { registryLifecycle: step.registryLifecycle }),
  ...(step.agentOutcomes === undefined ? {} : { agentOutcomes: step.agentOutcomes }),
});

const executeStep = <Requirements, Output>(
  step: PlannedJobStep<Requirements, Output>,
): Effect.Effect<CompletedJobStep<Output>, never, Requirements> => {
  switch (step.readiness) {
    case "error":
      return Effect.succeed({
        ...(step.key === undefined ? {} : { key: step.key }),
        ...stepEvidence(step),
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
        Effect.map((result): CompletedJobStep<Output> => ({
          ...(step.key === undefined ? {} : { key: step.key }),
          ...stepEvidence(step),
          label: step.label,
          result,
        })),
        Effect.catch((error): Effect.Effect<CompletedJobStep<Output>> => {
          return Effect.succeed({
            ...(step.key === undefined ? {} : { key: step.key }),
            ...stepEvidence(step),
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
        Effect.map((result): CompletedJobStep<Output> => ({
          ...(step.key === undefined ? {} : { key: step.key }),
          ...stepEvidence(step),
          label: step.label,
          result: appendReadinessWarning(step, result),
        })),
        Effect.catch((error): Effect.Effect<CompletedJobStep<Output>> => {
          return Effect.succeed({
            ...(step.key === undefined ? {} : { key: step.key }),
            ...stepEvidence(step),
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

const blockStep = <Output>(
  step: PlannedJobStep<unknown, Output>,
  message: string,
  blocking: UnitBlocking,
  blockedBy?: ReadonlyArray<string>,
): CompletedJobStep<Output> => ({
  ...(step.key === undefined ? {} : { key: step.key }),
  ...stepEvidence(step),
  label: step.label,
  ...(blockedBy === undefined ? {} : { blockedBy }),
  result: {
    result: "error",
    message,
    error: makeAppError({
      code: "conflict",
      detail: message,
    }),
    blocking,
  },
});

const applyReadinessGate = <Output>(
  plan: Plan<unknown, Output>,
): ReadonlyArray<ReadonlyArray<CompletedJobStep<Output>>> =>
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
        : blockStep(step, "blocked by plan readiness error", { class: "precondition-unmet" }),
    ),
  );

/**
 * Run one unit with its start and settlement observations. The started fact
 * is recorded before the run begins, and the settlement fact is recorded
 * before any interruptible boundary follows the run's completion — an
 * interrupt arriving with the completion can otherwise erase the only
 * in-memory evidence that the unit's durable effect was committed. The run
 * itself stays interruptible; the mask covers only the observations.
 */
const runStepObserved = <Requirements, Output>(
  step: PlannedJobStep<Requirements, Output>,
  observeStart: (step: StartedJobStep) => Effect.Effect<void>,
  observeStep: (step: CompletedJobStep<Output>) => Effect.Effect<void>,
): Effect.Effect<CompletedJobStep<Output>, never, Requirements> =>
  Effect.uninterruptibleMask((restore) =>
    observeStart(step).pipe(Effect.andThen(restore(executeStep(step))), Effect.tap(observeStep)),
  );

const executeFailFastJob = <Requirements, Output>(
  job: Job<Requirements, Output>,
  observeStart: (step: StartedJobStep) => Effect.Effect<void>,
  observeStep: (step: CompletedJobStep<Output>) => Effect.Effect<void>,
): Effect.Effect<ReadonlyArray<CompletedJobStep<Output>>, never, Requirements> =>
  Effect.gen(function* () {
    const completed: CompletedJobStep<Output>[] = [];
    let failed = false;
    let failedStepId: string | undefined;
    for (const step of job.steps) {
      if (failed) {
        const blocked = blockStep(step, "blocked by earlier step failure", {
          class: "operation-aborted",
          ...(failedStepId === undefined ? {} : { reference: failedStepId }),
        });
        completed.push(blocked);
        yield* Effect.uninterruptible(observeStep(blocked));
        continue;
      }
      const result = yield* runStepObserved(step, observeStart, observeStep);
      completed.push(result);
      if (result.result.result === "error" && !failed) {
        failed = true;
        failedStepId = result.key ?? result.label;
      }
    }
    return completed;
  });

const executeBestEffortJob = <Requirements, Output>(
  job: Job<Requirements, Output>,
  observeStart: (step: StartedJobStep) => Effect.Effect<void>,
  observeStep: (step: CompletedJobStep<Output>) => Effect.Effect<void>,
): Effect.Effect<ReadonlyArray<CompletedJobStep<Output>>, never, Requirements> =>
  Effect.forEach(job.steps, (step) => runStepObserved(step, observeStart, observeStep), {
    concurrency: job.concurrency,
  });

const executeDependencyAwareJob = <Requirements, Output>(
  job: Job<Requirements, Output>,
  observeStart: (step: StartedJobStep) => Effect.Effect<void>,
  observeStep: (step: CompletedJobStep<Output>) => Effect.Effect<void>,
): Effect.Effect<ReadonlyArray<CompletedJobStep<Output>>, never, Requirements> =>
  Effect.gen(function* () {
    const stepsByKey = new Map(
      job.steps.flatMap((step) => (step.key === undefined ? [] : [[step.key, step] as const])),
    );
    const completed = new Map<string, CompletedJobStep<Output>>();
    const unkeyed = job.steps.filter((step) => step.key === undefined);
    for (const step of unkeyed) {
      const result = yield* runStepObserved(step, observeStart, observeStep);
      completed.set(`label:${step.label}`, result);
    }

    while ([...stepsByKey.keys()].some((key) => !completed.has(key))) {
      const remaining = [...stepsByKey.entries()].filter(([key]) => !completed.has(key));
      const blocked = remaining.filter(([, step]) =>
        (step.dependsOn ?? []).some((dependency) => {
          const result = completed.get(dependency);
          return result !== undefined && result.result.result === "error";
        }),
      );
      for (const [key, step] of blocked) {
        const blockedBy = (step.dependsOn ?? []).filter((dependency) => {
          const result = completed.get(dependency);
          return result !== undefined && result.result.result === "error";
        });
        const blocked = blockStep(
          step,
          `blocked by failed dependency: ${blockedBy.join(", ")}`,
          {
            class: "dependency-failed",
            ...(blockedBy[0] === undefined ? {} : { reference: blockedBy[0] }),
          },
          blockedBy,
        );
        completed.set(key, blocked);
        yield* Effect.uninterruptible(observeStep(blocked));
      }

      const ready = remaining.filter(
        ([key, step]) =>
          !completed.has(key) &&
          (step.dependsOn ?? []).every((dependency) => {
            const result = completed.get(dependency);
            return result === undefined
              ? !stepsByKey.has(dependency)
              : result.result.result !== "error";
          }),
      );
      if (ready.length === 0) {
        for (const [key, step] of remaining) {
          if (completed.has(key)) continue;
          completed.set(
            key,
            blockStep(
              step,
              "blocked by an unresolved dependency cycle",
              { class: "dependency-cycle" },
              step.dependsOn ?? [],
            ),
          );
        }
        break;
      }
      const results = yield* Effect.forEach(
        ready,
        ([, step]) => runStepObserved(step, observeStart, observeStep),
        { concurrency: job.concurrency },
      );
      for (const result of results) {
        if (result.key !== undefined) completed.set(result.key, result);
      }
    }

    return job.steps.map(
      (step) =>
        completed.get(step.key ?? `label:${step.label}`) ??
        blockStep(step, "blocked by an unresolved execution dependency", {
          class: "dependency-cycle",
        }),
    );
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
/** Identity of a unit whose run closure is starting. */
export interface StartedJobStep {
  readonly key?: string;
  readonly label: string;
}

export interface ApplyPlanOptions<Output> {
  /** Observes each unit as its run closure starts; never controls execution. */
  readonly onStepStarted?: (step: StartedJobStep) => Effect.Effect<void>;
  /** Observes each unit the moment it completes; never controls execution. */
  readonly onStepCompleted?: (step: CompletedJobStep<Output>) => Effect.Effect<void>;
}

export const applyPlan = <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  options?: ApplyPlanOptions<Output>,
): Effect.Effect<ExecutedPlan<Output>, never, Requirements> =>
  Effect.gen(function* () {
    const observeStep = options?.onStepCompleted ?? (() => Effect.void);
    const observeStart = options?.onStepStarted ?? (() => Effect.void);
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
              ? Effect.succeed<ReadonlyArray<CompletedJobStep<Output>>>(
                  job.steps.map((step) =>
                    blockStep(step, "blocked by earlier job failure", {
                      class: "operation-aborted",
                    }),
                  ),
                )
              : (job.steps.some((step) => (step.dependsOn ?? []).length > 0)
                  ? executeDependencyAwareJob(job, observeStart, observeStep)
                  : job.executionPolicy === "best-effort"
                    ? executeBestEffortJob(job, observeStart, observeStep)
                    : executeFailFastJob(job, observeStart, observeStep)
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
      ...(plan.releaseAge === undefined ? {} : { releaseAge: plan.releaseAge }),
      ...(plan.preconditions === undefined ? {} : { preconditions: plan.preconditions }),
      ...(plan.riskConditions === undefined ? {} : { riskConditions: plan.riskConditions }),
      jobs: Array.map(jobResults, (steps, i) => ({
        concurrency: plan.jobs[i]?.concurrency ?? 1,
        ...(plan.jobs[i]?.executionPolicy === undefined
          ? {}
          : { executionPolicy: plan.jobs[i].executionPolicy }),
        steps,
      })),
    } satisfies ExecutedPlan<Output>;
  }).pipe(Effect.withSpan("Plan.applyPlan"));
