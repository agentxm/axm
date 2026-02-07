/**
 * Shared plan apply module.
 *
 * Iterates over plan jobs and their actions, dispatching each "execute"
 * action to the matching executor from a typed registry keyed by `_tag`.
 * No-op actions are skipped.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { Action, Plan } from "./plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Result returned by every operation handler.
 */
export type OperationResult = {
  readonly action: "no-op" | "success" | "error";
  readonly message: string;
};

/**
 * Yielded by handlers for hard failures — applyPlan catches and converts to error result.
 */
export class OperationError extends Data.TaggedError("OperationError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause: unknown;
}> {}

/**
 * Handler function for a specific operation type.
 */
export type OperationHandler<Op, R = never> = (
  op: Op,
) => Effect.Effect<OperationResult, OperationError, R>;

/**
 * Executor registry — a handler for every `_tag` in the operation union.
 * TypeScript enforces exhaustiveness at compile time.
 *
 * R is left as a free parameter so concrete registries can carry requirements
 * (e.g. FileSystem, Clack). `ExecutionContext` extracts R from the concrete type.
 */
export type Handlers<Op extends { _tag: string }> = {
  [K in Op["_tag"]]: (
    op: Extract<Op, { _tag: K }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Effect.Effect<OperationResult, OperationError, any>;
};

/**
 * Extract the union of R (requirements) from all handler functions in the registry.
 */
export type ExecutionContext<T> = {
  [K in keyof T]: T[K] extends (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => Effect.Effect<OperationResult, OperationError, infer R>
    ? R
    : never;
}[keyof T];

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const applyAction = <Op extends { _tag: string }, T extends Handlers<Op>>(
  action: Action<Op>,
  handlers: T,
): Effect.Effect<OperationResult, never, ExecutionContext<T>> => {
  if (action.action !== "execute") {
    return Effect.succeed({ action: "no-op" as const, message: `Skipped: ${action.label}` });
  }
  // Cast needed: TS can't correlate dynamic _tag lookup with the Extract<Op, {_tag: K}> parameter
  const handler = handlers[action.op._tag as Op["_tag"]] as unknown as (
    op: Op,
  ) => Effect.Effect<OperationResult, OperationError, ExecutionContext<T>>;
  return handler(action.op).pipe(
    Effect.catchTag("OperationError", (error) =>
      Effect.succeed({
        action: "error" as const,
        message: error.message,
      }),
    ),
  );
};

/**
 * Apply a plan by iterating jobs and dispatching execute actions to the executor registry.
 *
 * Uses `Effect.forEach` with each job's `concurrency` setting.
 * Only processes `"execute"` actions — `"no-op"` actions are skipped.
 * Never fails — catches OperationError and converts to error results.
 */
export const applyPlan = <Op extends { _tag: string }, T extends Handlers<Op>>(
  plan: Plan<Op>,
  handlers: T,
): Effect.Effect<ReadonlyArray<OperationResult>, never, ExecutionContext<T>> =>
  Effect.map(
    Effect.forEach(
      plan.jobs,
      (job) =>
        Effect.forEach(job.steps, (action) => applyAction(action, handlers), {
          concurrency: job.concurrency,
        }),
      { concurrency: 1 },
    ),
    (jobResults) => jobResults.flat(),
  );
