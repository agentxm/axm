import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { ClackProgress } from "./service.js";
import type { ClackProgressConfig, ClackProgressHandle } from "./types.js";

export interface ClackProgressCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export class ClackProgressTest extends Context.Tag("@axm.sh/cli/test/ClackProgressTest")<
  ClackProgressTest,
  {
    readonly ref: Ref.Ref<ReadonlyArray<ClackProgressCall>>;
    readonly get: Effect.Effect<ReadonlyArray<ClackProgressCall>>;
  }
>() {}

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
  Layer.effectContext(
    Effect.gen(function* () {
      const ref = yield* Ref.make<ReadonlyArray<ClackProgressCall>>([]);

      const service: Context.Tag.Service<typeof ClackProgress> = {
        start: (config, message) =>
          Effect.zipRight(
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
              Effect.zipRight(Effect.interruptible(f(handle))),
              Effect.matchCauseEffect({
                onFailure: (cause) => {
                  if (Cause.isInterruptedOnly(cause)) {
                    return Effect.zipRight(
                      appendCall(ref, "withProgress.cancel", []),
                      Effect.failCause(cause),
                    );
                  }
                  return Effect.zipRight(
                    appendCall(ref, "withProgress.error", [message]),
                    Effect.failCause(cause),
                  );
                },
                onSuccess: (a) =>
                  Effect.zipRight(
                    appendCall(ref, "withProgress.stop", [stopMessage ?? message]),
                    Effect.succeed(a),
                  ),
              }),
              Effect.uninterruptible,
            );
          }),
      };

      const test: Context.Tag.Service<typeof ClackProgressTest> = {
        ref,
        get: Ref.get(ref),
      };

      return Context.empty().pipe(
        Context.add(ClackProgress, service),
        Context.add(ClackProgressTest, test),
      );
    }),
  );
