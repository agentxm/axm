import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { ClackStream } from "./service.js";

export interface ClackStreamCall {
  readonly method: string;
  readonly values: ReadonlyArray<string>;
}

export class ClackStreamTest extends ServiceMap.Service<
  ClackStreamTest,
  {
    readonly ref: Ref.Ref<ReadonlyArray<ClackStreamCall>>;
    readonly get: Effect.Effect<ReadonlyArray<ClackStreamCall>>;
  }
>()("@axm.sh/cli/test/ClackStreamTest") {}

export const ClackStreamTestLayer: Layer.Layer<ClackStream | ClackStreamTest> = Layer.effectServices(
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<ClackStreamCall>>([]);

    const makeMethod =
      (method: string) =>
      <E, R>(stream: Stream.Stream<string, E, R>) =>
        Effect.gen(function* () {
          const values = yield* Stream.runCollect(stream);
          yield* Ref.update(ref, (calls) => [...calls, { method, values }]);
        });

    const service: ServiceMap.Service.Shape<typeof ClackStream> = {
      message: makeMethod("message"),
      info: makeMethod("info"),
      success: makeMethod("success"),
      step: makeMethod("step"),
      warn: makeMethod("warn"),
      error: makeMethod("error"),
    };

    const test: ServiceMap.Service.Shape<typeof ClackStreamTest> = {
      ref,
      get: Ref.get(ref),
    };

    return ServiceMap.empty().pipe(
      ServiceMap.add(ClackStream, service),
      ServiceMap.add(ClackStreamTest, test),
    );
  }),
);
