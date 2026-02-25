/**
 * Shared plan apply module.
 *
 * Iterates over plan jobs and their steps, dispatching each step with
 * `ready` or `warn` readiness to the matching handler from a typed registry
 * keyed by operation `name`. Steps with `skip` or `error` readiness are
 * promoted without dispatch.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { makeCliError, type CliError } from "../cli-error/index.js";
import type {
  JobStep,
  JobStepResult,
  Operation,
  OperationMap,
  OperationMapFromUnion,
  OperationResult,
  Plan,
  PlannedJobStep,
} from "./plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Handler function for a specific operation type.
 */
export type OperationHandler<Op, R = never> = (
  op: Op,
) => Effect.Effect<OperationResult, CliError, R>;

/**
 * Executor registry — a handler for every `name` in the operation union.
 * TypeScript enforces exhaustiveness at compile time.
 *
 * R is left as a free parameter so concrete registries can carry requirements
 * (e.g. FileSystem, Log). `ExecutionContext` extracts R from the concrete type.
 */
export type Handlers<Ops extends OperationMap> = {
  [K in keyof Ops]: OperationHandler<Ops[K], unknown>;
};

/**
 * Extract the union of R (requirements) from all handler functions in the registry.
 */
export type ExecutionContext<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends (
    ...args: ReadonlyArray<never>
  ) => Effect.Effect<OperationResult, CliError, infer R>
    ? R
    : never;
}[keyof T];

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const applyStep = <
  Op extends Operation<string, unknown>,
  T extends Handlers<OperationMapFromUnion<Op>>,
>(
  step: PlannedJobStep<Op>,
  handlers: T,
): Effect.Effect<JobStepResult<Op>, never, ExecutionContext<T>> => {
  const formatStepError = (error: CliError): string => {
    const detailSuffix = error.details.length > 0 ? ` | ${error.details.join(" | ")}` : "";
    return `${error.what} (${error.code})${detailSuffix}`;
  };

  const promote = (result: OperationResult): JobStepResult<Op> => ({
    _tag: "JobStepResult",
    operation: step.operation,
    result,
    label: step.label,
  });

  switch (step.readiness.status) {
    case "skip":
      return Effect.succeed(promote({ result: "no-op", message: step.readiness.message }));
    case "error":
      return Effect.succeed(
        promote({
          result: "error",
          message: step.readiness.message,
          error: makeCliError({
            code: "PLAN_STEP_ERROR",
            what: step.readiness.message,
          }),
        }),
      );
    case "ready":
    case "warn": {
      return runHandler(handlers, step.operation).pipe(
        Effect.map(promote),
        Effect.catchAll((error) =>
          Effect.succeed(promote({ result: "error", message: formatStepError(error), error })),
        ),
      );
    }
  }
};

const runHandler = <
  Op extends Operation<string, unknown>,
  T extends Handlers<OperationMapFromUnion<Op>>,
>(
  handlers: T,
  operation: Op,
): Effect.Effect<OperationResult, CliError, ExecutionContext<T>> => {
  const handler = handlers[operation.name as Op["name"]] as unknown as OperationHandler<
    Op,
    ExecutionContext<T>
  >;
  return handler(operation);
};

const isPlannedStep = <Op extends Operation<string, unknown>>(
  step: JobStep<Op>,
): step is PlannedJobStep<Op> => step._tag === "PlannedJobStep";

const applyOrKeepStep = <
  Op extends Operation<string, unknown>,
  T extends Handlers<OperationMapFromUnion<Op>>,
>(
  step: JobStep<Op>,
  handlers: T,
): Effect.Effect<JobStepResult<Op>, never, ExecutionContext<T>> =>
  isPlannedStep(step) ? applyStep(step, handlers) : Effect.succeed(step);

/**
 * Apply a plan by iterating jobs and dispatching steps to the executor registry.
 *
 * Uses `Effect.forEach` with each job's `concurrency` setting.
 * Steps with `ready` or `warn` readiness are dispatched to handlers; `skip` and `error` are promoted without dispatch.
 * Never fails — catches CliError and converts to error results.
 */
export const applyPlan = <
  Op extends Operation<string, unknown>,
  T extends Handlers<OperationMapFromUnion<Op>>,
>(
  plan: Plan<Op>,
  handlers: T,
): Effect.Effect<Plan<Op>, never, ExecutionContext<T>> =>
  Effect.map(
    Effect.forEach(
      plan.jobs,
      (job) =>
        Effect.forEach(job.steps, (step) => applyOrKeepStep(step, handlers), {
          concurrency: job.concurrency,
        }),
      { concurrency: 1 },
    ),
    (jobResults) => ({
      ...plan,
      jobs: Array.map(jobResults, (steps, i) => ({
        ...plan.jobs[i]!,
        steps,
      })),
    }),
  ).pipe(Effect.withSpan("Workspace.applyPlan"));
