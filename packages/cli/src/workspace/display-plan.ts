/**
 * Shared plan display module.
 *
 * Renders a human-readable summary of any Plan<Op> via the Log service,
 * without knowledge of the specific operation type.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log } from "../tui/index.js";
import type { JobStep, OperationResult, Plan } from "./plan.js";

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Display a plan summary via the Log service.
 *
 * Uses `step.label` for human-readable output — never inspects `step.operation`.
 */
export const displayPlan = <Op>(plan: Plan<Op>) =>
  Effect.gen(function* () {
    const log = yield* Log;

    const allSteps = Array.flatMap(plan.jobs, (job) => [...job.steps]);

    // Extract the relevant result based on step phase
    const getResult = (step: JobStep<Op>): OperationResult =>
      step._tag === "JobStepResult" ? step.actualResult : step.expectedResult;

    const isApplied = allSteps.length > 0 && allSteps[0]!._tag === "JobStepResult";

    const successSteps = Array.filter(allSteps, (s) => getResult(s).result === "success");
    const noopSteps = Array.filter(allSteps, (s) => getResult(s).result === "no-op");
    const errorSteps = Array.filter(allSteps, (s) => getResult(s).result === "error");

    // Heading
    const heading = Option.match(plan.description, {
      onNone: () => plan.name,
      onSome: (desc) => `${plan.name}\n${desc}`,
    });
    yield* log.info(heading);

    // Success items
    if (successSteps.length > 0) {
      for (const step of successSteps) {
        if (isApplied) {
          yield* log.success(`  ✓ ${step.label}`);
        } else {
          yield* log.success(`  + ${step.label}`);
        }
      }
    }

    // No-op items
    if (noopSteps.length > 0) {
      for (const step of noopSteps) {
        yield* log.warn(`  - ${step.label} (${getResult(step).message})`);
      }
    }

    // Error items
    if (errorSteps.length > 0) {
      for (const step of errorSteps) {
        yield* log.error(`  ✗ ${step.label} (${getResult(step).message})`);
      }
    }

    // Summary with phase-appropriate tense
    const successCount = successSteps.length;
    const skipCount = noopSteps.length;
    if (isApplied) {
      yield* log.message(`${successCount} installed, ${skipCount} skipped`);
    } else {
      yield* log.message(`${successCount} to install, ${skipCount} to skip`);
    }
  });
