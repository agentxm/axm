/**
 * Operation exit code transport.
 *
 * The plan-family emit boundary derives its exit code from the operation
 * resolution's outcome with one pure mapping and records it here; the runtime
 * envelope honors a recorded code verbatim instead of re-deriving one from
 * semantic telemetry properties.
 */

import type { CommandSettlementFailure } from "./telemetry.js";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/Context";

export interface OperationSettlement {
  readonly exitCode: number;
  readonly failure?: CommandSettlementFailure;
}

export class OperationExit extends ServiceMap.Service<
  OperationExit,
  { readonly ref: Ref.Ref<Option.Option<OperationSettlement>> }
>()("axm.sh/cli-runtime/operation-exit/OperationExit") {}

/** Record the exit code the operation's outcome mapped to. No-op when absent. */
export const setOperationSettlement = (settlement: OperationSettlement): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(OperationExit);
    if (Option.isNone(service)) return;
    yield* Ref.set(service.value.ref, Option.some(settlement));
  });

export const getOperationSettlement: Effect.Effect<Option.Option<OperationSettlement>> = Effect.gen(
  function* () {
    const service = yield* Effect.serviceOption(OperationExit);
    if (Option.isNone(service)) return Option.none();
    return yield* Ref.get(service.value.ref);
  },
);

export const OperationExitLive: Layer.Layer<OperationExit> = Layer.effect(
  OperationExit,
  Effect.gen(function* () {
    const ref = yield* Ref.make<Option.Option<OperationSettlement>>(Option.none());
    return { ref };
  }),
);

/** The exit projection used by the process and signal adapters. */
export const getOperationExitCode = getOperationSettlement.pipe(
  Effect.map(Option.map((settlement) => settlement.exitCode)),
);
