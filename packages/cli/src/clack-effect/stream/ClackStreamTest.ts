import * as Chunk from "effect/Chunk";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { ClackStream } from "./service.js";

export interface ClackStreamCall {
  readonly method: string;
  readonly values: ReadonlyArray<string>;
}

export class ClackStreamTest extends Context.Tag("@axm.sh/cli/test/ClackStreamTest")<
  ClackStreamTest,
  {
    readonly ref: Ref.Ref<ReadonlyArray<ClackStreamCall>>;
    readonly get: Effect.Effect<ReadonlyArray<ClackStreamCall>>;
  }
>() {}

export const ClackStreamTestLayer: Layer.Layer<ClackStream | ClackStreamTest> = Layer.effectContext(
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<ClackStreamCall>>([]);

    const makeMethod =
      (method: string) =>
      <E, R>(stream: Stream.Stream<string, E, R>) =>
        Effect.gen(function* () {
          const chunks = yield* Stream.runCollect(stream);
          const values = Chunk.toReadonlyArray(chunks);
          yield* Ref.update(ref, (calls) => [...calls, { method, values }]);
        });

    const service: Context.Tag.Service<typeof ClackStream> = {
      message: makeMethod("message"),
      info: makeMethod("info"),
      success: makeMethod("success"),
      step: makeMethod("step"),
      warn: makeMethod("warn"),
      error: makeMethod("error"),
    };

    const test: Context.Tag.Service<typeof ClackStreamTest> = {
      ref,
      get: Ref.get(ref),
    };

    return Context.empty().pipe(
      Context.add(ClackStream, service),
      Context.add(ClackStreamTest, test),
    );
  }),
);
