/**
 * Footprint recorder — observed durable changes.
 *
 * The layers that touch durable state record what they actually committed,
 * removed, or restored here; the operation resolution's footprint is these
 * observations, not planner-claimed artifact paths. Recording is a no-op when
 * no recorder is provided, so the writers stay usable outside an operation
 * boundary.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/Context";

export interface FootprintObservation {
  /** Absolute path of the durable change. */
  readonly path: string;
  readonly change: "created" | "modified" | "removed" | "restored";
}

export class FootprintRecorder extends ServiceMap.Service<
  FootprintRecorder,
  { readonly ref: Ref.Ref<ReadonlyArray<FootprintObservation>> }
>()("@agentxm/client-core/unstable/workspace/footprint-recorder/FootprintRecorder") {}

/** Record one observed durable change. No-op without a recorder. */
export const recordFootprint = (observation: FootprintObservation): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(FootprintRecorder);
    if (Option.isNone(service)) return;
    yield* Ref.update(service.value.ref, (entries) => [...entries, observation]);
  });

export const readFootprint: Effect.Effect<ReadonlyArray<FootprintObservation>> = Effect.gen(
  function* () {
    const service = yield* Effect.serviceOption(FootprintRecorder);
    if (Option.isNone(service)) return [];
    return yield* Ref.get(service.value.ref);
  },
);

export const makeFootprintRecorder: Effect.Effect<
  ServiceMap.Service.Shape<typeof FootprintRecorder>
> = Ref.make<ReadonlyArray<FootprintObservation>>([]).pipe(Effect.map((ref) => ({ ref })));
