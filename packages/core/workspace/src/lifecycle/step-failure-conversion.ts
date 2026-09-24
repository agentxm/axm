/**
 * The conversion from a lifecycle operation's typed failure union into the
 * plan-step vocabulary, as a service lifecycle operations keep in `R`.
 *
 * The kernel owns the rendering and supplies the implementation as
 * `LifecycleFailureConversionLive`; the application provides that Layer once
 * per invocation. Nothing in the channel is `unknown` — the port names the
 * exact union a lifecycle operation can surface, so a new failure family is a
 * compile error here rather than a silently mis-rendered step.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type { StepFailure } from "../transitions/planning/index.js";
import type { ExtensionManagerFailure } from "../materialization/index.js";
import type { ExtensionResolutionFailed } from "../resolution/index.js";
import type { ExtensionLifecycleFailed } from "./errors.js";

/**
 * Every failure a lifecycle operation can surface: the materialization
 * families and the integration families they carry, the resolution refusal a
 * configured entry's source can produce before any plan exists, plus the
 * feature's own typed failure.
 */
export type LifecycleFailure =
  ExtensionManagerFailure | ExtensionResolutionFailed | ExtensionLifecycleFailed | StepFailure;

export interface StepFailureConversionService {
  /** Serialize one lifecycle failure into the plan-step vocabulary. */
  readonly toStepFailure: (failure: LifecycleFailure) => StepFailure;
}

export class StepFailureConversion extends ServiceMap.Service<
  StepFailureConversion,
  StepFailureConversionService
>()("@agentxm/workspace/lifecycle/step-failure-conversion/StepFailureConversion") {}

/**
 * Serialize every failure of one lifecycle operation into the plan-step
 * vocabulary through the provided conversion.
 */
export const withAdaptedStepFailures = <A, E extends LifecycleFailure, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, StepFailure, R | StepFailureConversion> =>
  Effect.gen(function* () {
    const conversion = yield* StepFailureConversion;
    return yield* effect.pipe(Effect.mapError((failure) => conversion.toStepFailure(failure)));
  });
