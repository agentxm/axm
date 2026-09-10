/**
 * Gate a plan on authoritative lockfile health.
 *
 * A missing lockfile is an absent accepted-resolution set: the already-resolved
 * lifecycle plan may establish needed rows atomically. An invalid lockfile is
 * authoritative but unreadable, so execution blocks without reconstructing it
 * from canonical content, manifests, or observation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { Plan } from "../plan/plan.js";
import type { LockfileState } from "@agentxm/workspace-state";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type DegradedLockfileState = Exclude<LockfileState, "ok">;

export interface AugmentedPlanResult<Requirements = never, Output = never> {
  readonly plan: Plan<Requirements, Output>;
  readonly reconciliationTriggered: boolean;
  readonly reason?: DegradedLockfileState;
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Return the plan unchanged when authority is readable or absent. Replace it
 * with one explicit blocker when the authoritative file is unreadable.
 */
export const augmentPlanWithReconciliation = <Requirements, Output, LoadError>(
  plan: Plan<Requirements, Output>,
  getLockfileState: () => Effect.Effect<LockfileState, LoadError>,
): Effect.Effect<AugmentedPlanResult<Requirements, Output>, LoadError> =>
  Effect.gen(function* () {
    const lockfileState = yield* getLockfileState();

    if (lockfileState !== "invalid") {
      return {
        plan,
        reconciliationTriggered: lockfileState === "missing",
        ...(lockfileState === "missing" ? { reason: "missing" as const } : {}),
      };
    }

    return {
      plan: {
        _tag: "Plan",
        name: plan.name,
        description: plan.description,
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                key: "workspace:lockfile-invalid",
                readiness: "error",
                label: "Read accepted external resolutions",
                errorMessage:
                  "The authoritative lockfile is invalid and cannot be reconstructed from workspace observation.",
              },
            ],
          },
        ],
      },
      reconciliationTriggered: true,
      reason: "invalid",
    };
  });
