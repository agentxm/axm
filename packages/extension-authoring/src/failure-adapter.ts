/**
 * The application-supplied conversion from authoring failures to the plan
 * step vocabulary. Error rendering is application-owned: the CLI implements
 * this with the same dispatcher it uses at its output boundary, so step
 * categories and details inside authoring operations stay byte-identical
 * with rendered errors. The feature keeps only the requirement, never the
 * mapping.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type { StepFailure } from "@agentxm/workspace-operations";

export interface AuthoringFailureAdapterService {
  /**
   * Serialize any failure an authoring operation can surface — kernel
   * failures and the feature's own typed failures — into the plan-step
   * vocabulary.
   */
  readonly toStepFailure: (failure: unknown) => StepFailure;
}

export class AuthoringFailureAdapter extends ServiceMap.Service<
  AuthoringFailureAdapter,
  AuthoringFailureAdapterService
>()("@agentxm/extension-authoring/failure-adapter/AuthoringFailureAdapter") {}

/**
 * Serialize every failure of one authoring operation into the plan-step
 * vocabulary through the application-supplied adapter.
 */
export const withAdaptedStepFailures = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, StepFailure, R | AuthoringFailureAdapter> =>
  Effect.gen(function* () {
    const adapter = yield* AuthoringFailureAdapter;
    return yield* effect.pipe(Effect.mapError((failure) => adapter.toStepFailure(failure)));
  });
