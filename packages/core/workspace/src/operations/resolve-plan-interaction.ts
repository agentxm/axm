/**
 * Plan-resolution interaction port.
 *
 * `resolveExecutionCandidate` presents candidates and obtains the apply confirmation
 * exclusively through this service. The CLI runtime provides the renderer- and
 * prompt-backed implementation; wording and verbosity gating belong to that
 * implementation, never to the kernel. Progress is not an interaction: the
 * kernel publishes typed lifecycle events (`plan/operation-events`) that
 * observers render.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import type { PlanInteractionFailed } from "./errors.js";
import type { ConfirmationRecovery } from "./plan-execution.js";
import type { Plan } from "./plan.js";

/**
 * Outcome of the apply confirmation. `cancelled` is the typed successor of a
 * caught prompt cancellation at the CLI implementation; the kernel treats it
 * as declined today, but the distinction is preserved for resolutions.
 */
export type ApplyConfirmation = "approved" | "declined" | "cancelled";

export interface ResolvePlanInteractionService {
  /** Whether an interactive confirmation can be obtained. */
  readonly isConfirmationAvailable: Effect.Effect<boolean, PlanInteractionFailed>;
  readonly confirmApplyChanges: (
    recovery: ConfirmationRecovery,
  ) => Effect.Effect<ApplyConfirmation, PlanInteractionFailed>;
  /**
   * Present the immutable candidate. The implementation owns the
   * verbosity/quiet/mode gate and all wording; the kernel calls this
   * unconditionally.
   */
  readonly presentPlan: (
    plan: Plan<unknown, unknown>,
    options: { readonly mode: "preview" | "apply" },
  ) => Effect.Effect<void, PlanInteractionFailed>;
}

export class ResolvePlanInteraction extends ServiceMap.Service<
  ResolvePlanInteraction,
  ResolvePlanInteractionService
>()(
  "@agentxm/workspace/transitions/planning/plan/resolve-plan-interaction/ResolvePlanInteraction",
) {}
