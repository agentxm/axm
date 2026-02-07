/**
 * Shared plan display module.
 *
 * Renders a human-readable summary of any Plan<Op> via Clack,
 * without knowledge of the specific operation type.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Clack } from "../clack-effect/index.js";
import type { JobStep, Plan } from "./plan.js";

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Display a plan summary via Clack.
 *
 * Uses `step.label` for human-readable output — never inspects `step.operation`.
 */
export const displayPlan = <Op>(plan: Plan<Op>) =>
  Effect.gen(function* () {
    const clack = yield* Clack;

    const allActions = plan.jobs.flatMap((job) => [...job.steps]);
    const executeActions = allActions.filter((a): a is JobStep<Op> => a.action === "execute");
    const noopActions = allActions.filter((a): a is JobStep<Op> => a.action === "no-op");

    // Heading
    const heading = Option.match(plan.description, {
      onNone: () => plan.name,
      onSome: (desc) => `${plan.name}\n${desc}`,
    });
    yield* clack.log.info(heading);

    // Execute actions
    if (executeActions.length > 0) {
      for (const action of executeActions) {
        yield* clack.log.success(`  + ${action.label}`);
      }
    }

    // No-op actions
    if (noopActions.length > 0) {
      for (const action of noopActions) {
        const reason = Option.getOrElse(action.reason, () => "skipped");
        yield* clack.log.warn(`  - ${action.label} (${reason})`);
      }
    }

    // Summary
    const installCount = executeActions.length;
    const skipCount = noopActions.length;
    yield* clack.log.message(`${installCount} to install, ${skipCount} to skip`);
  });
