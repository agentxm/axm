/**
 * Shared plan apply module.
 *
 * Iterates over plan jobs and their actions, using Effect concurrency
 * based on each job's concurrency setting. Execute actions are applied;
 * no-op actions are skipped.
 *
 * Stub only — no file system mutations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { Clack } from "../clack-effect/index.js";
import type { Action, Plan } from "./plan.js";

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const applyAction = <Op>(action: Action<Op>) =>
  Effect.gen(function* () {
    if (action.action !== "execute") return;
    const clack = yield* Clack;
    yield* clack.log.success(`Installed ${action.label}`);
  });

/**
 * Apply a plan by iterating jobs and executing actions.
 *
 * Uses `Effect.forEach` with each job's `concurrency` setting.
 * Only processes `"execute"` actions — `"no-op"` actions are skipped.
 */
export const applyPlan = <Op>(plan: Plan<Op>) =>
  Effect.forEach(
    plan.jobs,
    (job) =>
      Effect.forEach(job.steps, (action) => applyAction(action), {
        concurrency: job.concurrency,
      }),
    { concurrency: 1 },
  );
