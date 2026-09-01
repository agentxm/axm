/**
 * Presentation port for the source-resolution phase of lifecycle workflows.
 * The feature marks where progress feedback belongs; the application owns the
 * mechanism and wording (the CLI renders a spinner around the phase).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import type * as Effect from "effect/Effect";

export interface LifecycleResolutionProgressService {
  /** Surround the source-resolution phase with the application's progress feedback. */
  readonly withSourceResolution: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

export class LifecycleResolutionProgress extends ServiceMap.Service<
  LifecycleResolutionProgress,
  LifecycleResolutionProgressService
>()("@agentxm/extension-lifecycle/resolution-progress/LifecycleResolutionProgress") {}
