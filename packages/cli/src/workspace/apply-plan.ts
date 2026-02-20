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
import type { CliError } from "../cli-error/index.js";
import type { JobStepResult, Operation, OperationResult, Plan, PlannedJobStep } from "./plan.js";

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
export type Handlers<Op extends Operation<string, unknown>> = {
  [K in Op["name"]]: (
    op: Extract<Op, { name: K }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Effect.Effect<OperationResult, CliError, any>;
};

/**
 * Extract the union of R (requirements) from all handler functions in the registry.
 */
export type ExecutionContext<T> = {
  [K in keyof T]: T[K] extends (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => Effect.Effect<OperationResult, CliError, infer R>
    ? R
    : never;
}[keyof T];

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const applyStep = <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
  step: PlannedJobStep<Op>,
  handlers: T,
): Effect.Effect<JobStepResult<Op>, never, ExecutionContext<T>> => {
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
      return Effect.succeed(promote({ result: "error", message: step.readiness.message }));
    case "ready":
    case "warn": {
      // Cast needed: TS can't correlate dynamic name lookup with the Extract<Op, {name: K}> parameter
      const handler = handlers[step.operation.name as Op["name"]] as unknown as (
        op: Op,
      ) => Effect.Effect<OperationResult, CliError, ExecutionContext<T>>;
      return handler(step.operation).pipe(
        Effect.map(promote),
        Effect.catchAll((error) =>
          Effect.succeed(promote({ result: "error" as const, message: error.what })),
        ),
      );
    }
  }
};

/**
 * Apply a plan by iterating jobs and dispatching steps to the executor registry.
 *
 * Uses `Effect.forEach` with each job's `concurrency` setting.
 * Steps with `ready` or `warn` readiness are dispatched to handlers; `skip` and `error` are promoted without dispatch.
 * Never fails — catches CliError and converts to error results.
 */
export const applyPlan = <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
  plan: Plan<Op>,
  handlers: T,
): Effect.Effect<Plan<Op>, never, ExecutionContext<T>> =>
  Effect.map(
    Effect.forEach(
      plan.jobs,
      (job) =>
        Effect.forEach(job.steps, (step) => applyStep(step as PlannedJobStep<Op>, handlers), {
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
