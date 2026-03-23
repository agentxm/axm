import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { ClackProgress } from "./service.js";
import type { ClackProgressConfig, ClackProgressHandle } from "./types.js";

export interface ClackProgressCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export class ClackProgressTest extends ServiceMap.Service<
  ClackProgressTest,
  {
    readonly ref: Ref.Ref<ReadonlyArray<ClackProgressCall>>;
    readonly get: Effect.Effect<ReadonlyArray<ClackProgressCall>>;
  }
>()("@axm.sh/cli/test/ClackProgressTest") {}

const appendCall = (
  ref: Ref.Ref<ReadonlyArray<ClackProgressCall>>,
  method: string,
  args: ReadonlyArray<unknown>,
) => Ref.update(ref, (calls) => [...calls, { method, args }]);

const makeMockHandle = (ref: Ref.Ref<ReadonlyArray<ClackProgressCall>>): ClackProgressHandle => ({
  stop: (message) => appendCall(ref, "handle.stop", [message]),
  message: (message) => appendCall(ref, "handle.message", [message]),
  cancel: (message) => appendCall(ref, "handle.cancel", [message]),
  error: (message) => appendCall(ref, "handle.error", [message]),
  clear: () => appendCall(ref, "handle.clear", []),
  advance: (step, message) => appendCall(ref, "handle.advance", [step, message]),
});

export const ClackProgressTestLayer: Layer.Layer<ClackProgress | ClackProgressTest> =
  Layer.effectServices(
    Effect.gen(function* () {
      const ref = yield* Ref.make<ReadonlyArray<ClackProgressCall>>([]);

      const service: ServiceMap.Service.Shape<typeof ClackProgress> = {
        start: (config, message) =>
          Effect.andThen(
            appendCall(ref, "start", [config, message]),
            Effect.succeed(makeMockHandle(ref)),
          ),
        withProgress: <A, E, R>(
          config: ClackProgressConfig,
          message: string,
          f: (handle: ClackProgressHandle) => Effect.Effect<A, E, R>,
          stopMessage?: string,
        ): Effect.Effect<A, E, R> =>
          Effect.suspend(() => {
            const handle = makeMockHandle(ref);

            return appendCall(ref, "withProgress.start", [config, message]).pipe(
              Effect.andThen(Effect.interruptible(f(handle))),
              Effect.matchCauseEffect({
                onFailure: (cause) => {
                  if (Cause.hasInterruptsOnly(cause)) {
                    return Effect.andThen(
                      appendCall(ref, "withProgress.cancel", []),
                      Effect.failCause(cause),
                    );
                  }
                  return Effect.andThen(
                    appendCall(ref, "withProgress.error", [message]),
                    Effect.failCause(cause),
                  );
                },
                onSuccess: (a) =>
                  Effect.andThen(
                    appendCall(ref, "withProgress.stop", [stopMessage ?? message]),
                    Effect.succeed(a),
                  ),
              }),
              Effect.uninterruptible,
            );
          }),
      };

      const test: ServiceMap.Service.Shape<typeof ClackProgressTest> = {
        ref,
        get: Ref.get(ref),
      };

      return ServiceMap.empty().pipe(
        ServiceMap.add(ClackProgress, service),
        ServiceMap.add(ClackProgressTest, test),
      );
    }),
  );
