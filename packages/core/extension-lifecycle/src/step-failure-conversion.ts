/**
 * The application-supplied conversion from a lifecycle operation's typed
 * failure union into the plan-step vocabulary and into display text.
 *
 * Error rendering is application-owned: the CLI implements this with the same
 * dispatcher it uses at its output boundary, so step categories and details
 * inside lifecycle plans stay byte-identical with rendered errors. Nothing in
 * the channel is `unknown` — the port names the exact union a lifecycle
 * operation can surface, so a new failure family is a compile error here
 * rather than a silently mis-rendered step.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type { StepFailure } from "@agentxm/workspace-operations";
import type { ExtensionManagerFailure } from "@agentxm/extension-materialization";
import type { ExtensionLifecycleFailed } from "./errors.js";

/**
 * Every failure a lifecycle operation can surface: the materialization
 * families and the integration families they carry, plus the feature's own
 * typed failure.
 */
export type LifecycleFailure = ExtensionManagerFailure | ExtensionLifecycleFailed | StepFailure;

export interface StepFailureConversionService {
  /** Serialize one lifecycle failure into the plan-step vocabulary. */
  readonly toStepFailure: (failure: LifecycleFailure) => StepFailure;
  /** Render one failure as the detail sentence the boundary would print. */
  readonly describeFailure: (failure: LifecycleFailure) => string;
  /** Render one failure as the boundary envelope's `message` property. */
  readonly describeFailureMessage: (failure: LifecycleFailure) => string;
}

export class StepFailureConversion extends ServiceMap.Service<
  StepFailureConversion,
  StepFailureConversionService
>()("@agentxm/extension-lifecycle/step-failure-conversion/StepFailureConversion") {}

/**
 * Serialize every failure of one lifecycle operation into the plan-step
 * vocabulary through the application-supplied conversion.
 */
export const withAdaptedStepFailures = <A, E extends LifecycleFailure, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, StepFailure, R | StepFailureConversion> =>
  Effect.gen(function* () {
    const conversion = yield* StepFailureConversion;
    return yield* effect.pipe(Effect.mapError((failure) => conversion.toStepFailure(failure)));
  });
