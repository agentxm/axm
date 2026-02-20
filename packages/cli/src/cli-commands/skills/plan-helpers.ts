/**
 * Shared plan helpers for single-step skill operations.
 *
 * Used by enable, disable, and rename handlers which all construct
 * a Plan with one job containing one step.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Plan } from "../../workspace/plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BuildSingleStepPlanArgs<TOperation> {
  /** The operation to execute */
  readonly operation: TOperation;
  /** Plan name (e.g. "Enable skill") */
  readonly name: string;
  /** Plan description (e.g. "Enable my-skill") */
  readonly description: string;
  /** Step label (e.g. skill name) */
  readonly label: string;
}

// -----------------------------------------------------------------------------
// Builder
// -----------------------------------------------------------------------------

export const buildSingleStepPlan = <TOperation>(
  args: BuildSingleStepPlanArgs<TOperation>,
): Plan<TOperation> => ({
  name: args.name,
  description: Option.some(args.description),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          _tag: "PlannedJobStep",
          operation: args.operation,
          readiness: { status: "ready", message: Option.none() },
          label: args.label,
        },
      ],
    },
  ],
});
