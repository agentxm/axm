/**
 * The conversion from a workspace operation's typed failures into the
 * plan-step vocabulary, as a service operations keep in `R`.
 *
 * The kernel owns the port and the rendering of its own failure families; the
 * application composes those with its features' families into one catalog
 * and provides the conversion once per invocation, so a failure reads the
 * same inside a plan step as at the command boundary. Nothing in the channel
 * is `unknown` — the port names the kernel's closed failure union, so a new
 * failure family is a compile error here rather than a silently mis-rendered
 * step.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type { StepFailure } from "../operations/index.js";
import type { KernelFailure } from "./failure-rendering.js";

export interface StepFailureConversionService {
  /** Serialize one kernel failure into the plan-step vocabulary. */
  readonly toStepFailure: (failure: KernelFailure) => StepFailure;
}

export class StepFailureConversion extends ServiceMap.Service<
  StepFailureConversion,
  StepFailureConversionService
>()("@agentxm/workspace-kernel/reconciliation/step-failure-conversion/StepFailureConversion") {}

/**
 * Serialize every failure of one operation into the plan-step vocabulary
 * through the provided conversion.
 */
export const withAdaptedStepFailures = <A, E extends KernelFailure, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, StepFailure, R | StepFailureConversion> =>
  Effect.gen(function* () {
    const conversion = yield* StepFailureConversion;
    return yield* effect.pipe(Effect.mapError((failure) => conversion.toStepFailure(failure)));
  });
