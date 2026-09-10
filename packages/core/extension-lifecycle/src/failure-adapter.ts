/**
 * The application-supplied conversion from lifecycle failures to the plan
 * step vocabulary and to display text. Error rendering is application-owned:
 * the CLI implements this with the same dispatcher it uses at its output
 * boundary, so step categories and details inside lifecycle plans stay
 * byte-identical with rendered errors. The feature keeps only the
 * requirement, never the mapping.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type { StepFailure } from "@agentxm/workspace-operations";

export interface LifecycleFailureAdapterService {
  /**
   * Serialize any failure a lifecycle operation can surface — kernel manager
   * failures, integration failures, and the feature's own typed failures —
   * into the plan-step vocabulary.
   */
  readonly toStepFailure: (failure: unknown) => StepFailure;
  /** Render one failure as the detail sentence the boundary would print. */
  readonly describeFailure: (failure: unknown) => string;
  /** Render one failure as the boundary envelope's `message` property. */
  readonly describeFailureMessage: (failure: unknown) => string;
}

export class LifecycleFailureAdapter extends ServiceMap.Service<
  LifecycleFailureAdapter,
  LifecycleFailureAdapterService
>()("@agentxm/extension-lifecycle/failure-adapter/LifecycleFailureAdapter") {}

/**
 * Serialize every failure of one lifecycle operation into the plan-step
 * vocabulary through the application-supplied adapter.
 */
export const withAdaptedStepFailures = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, StepFailure, R | LifecycleFailureAdapter> =>
  Effect.gen(function* () {
    const adapter = yield* LifecycleFailureAdapter;
    return yield* effect.pipe(Effect.mapError((failure) => adapter.toStepFailure(failure)));
  });
