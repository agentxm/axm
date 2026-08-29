/**
 * Operation exit code transport.
 *
 * The plan-family emit boundary derives its exit code from the operation
 * resolution's outcome with one pure mapping and records it here; the runtime
 * envelope honors a recorded code verbatim instead of re-deriving one from
 * semantic telemetry properties.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/Context";

export class OperationExit extends ServiceMap.Service<
  OperationExit,
  { readonly ref: Ref.Ref<Option.Option<number>> }
>()("@agentxm/client-core/unstable/cli-runtime/operation-exit/OperationExit") {}

/** Record the exit code the operation's outcome mapped to. No-op when absent. */
export const setOperationExitCode = (exitCode: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(OperationExit);
    if (Option.isNone(service)) return;
    yield* Ref.set(service.value.ref, Option.some(exitCode));
  });

export const getOperationExitCode: Effect.Effect<Option.Option<number>> = Effect.gen(function* () {
  const service = yield* Effect.serviceOption(OperationExit);
  if (Option.isNone(service)) return Option.none();
  return yield* Ref.get(service.value.ref);
});

export const OperationExitLive: Layer.Layer<OperationExit> = Layer.effect(
  OperationExit,
  Effect.gen(function* () {
    const ref = yield* Ref.make<Option.Option<number>>(Option.none());
    return { ref };
  }),
);
