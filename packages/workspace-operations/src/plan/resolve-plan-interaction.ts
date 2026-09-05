/**
 * Plan-resolution interaction port.
 *
 * `previewOrApplyPlan` presents candidates and obtains the apply confirmation
 * exclusively through this service. The CLI runtime provides the renderer- and
 * prompt-backed implementation; wording and verbosity gating belong to that
 * implementation, never to the kernel. Progress is not an interaction: the
 * kernel publishes typed lifecycle events (`plan/operation-events`) that
 * observers render.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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
  readonly isConfirmationAvailable: Effect.Effect<boolean>;
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
  ) => Effect.Effect<void>;
}

export class ResolvePlanInteraction extends ServiceMap.Service<
  ResolvePlanInteraction,
  ResolvePlanInteractionService
>()("@agentxm/workspace-operations/plan/resolve-plan-interaction/ResolvePlanInteraction") {}

export interface ResolvePlanInteractionTestState {
  readonly confirmApplyChangesCalls: Array<ConfirmationRecovery>;
  readonly presentPlanCalls: Array<{
    readonly planName: string;
    readonly mode: "preview" | "apply";
  }>;
}

export const ResolvePlanInteractionTest = (overrides?: {
  readonly isConfirmationAvailable?: boolean;
  readonly confirmApplyChanges?: (
    recovery: ConfirmationRecovery,
  ) => Effect.Effect<ApplyConfirmation, PlanInteractionFailed>;
  readonly presentPlan?: (
    plan: Plan<unknown, unknown>,
    options: { readonly mode: "preview" | "apply" },
  ) => Effect.Effect<void>;
}) => {
  const state: ResolvePlanInteractionTestState = {
    confirmApplyChangesCalls: [],
    presentPlanCalls: [],
  };

  const layer = Layer.succeed(ResolvePlanInteraction, {
    isConfirmationAvailable: Effect.succeed(overrides?.isConfirmationAvailable ?? false),
    confirmApplyChanges: (recovery) =>
      Effect.gen(function* () {
        state.confirmApplyChangesCalls.push(recovery);
        return yield* overrides?.confirmApplyChanges?.(recovery) ??
          Effect.succeed("approved" as const);
      }),
    presentPlan: (plan, options) =>
      Effect.gen(function* () {
        state.presentPlanCalls.push({ planName: plan.name, mode: options.mode });
        yield* overrides?.presentPlan?.(plan, options) ?? Effect.void;
      }),
  } satisfies ResolvePlanInteractionService);

  return { layer, state };
};
