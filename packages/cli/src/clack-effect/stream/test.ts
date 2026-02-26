import * as Chunk from "effect/Chunk";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { ClackStream, type ClackStreamService } from "./service.js";

export interface ClackStreamCall {
  readonly method: string;
  readonly values: ReadonlyArray<string>;
}

export interface MockClackStreamService extends ClackStreamService {
  readonly calls: ClackStreamCall[];
}

export function makeClackStreamTestLayer(): [Layer.Layer<ClackStream>, MockClackStreamService] {
  const calls: ClackStreamCall[] = [];

  const makeMethod =
    (method: string) =>
    <E, R>(stream: Stream.Stream<string, E, R>) =>
      Effect.gen(function* () {
        const chunks = yield* Stream.runCollect(stream);
        const values = Chunk.toReadonlyArray(chunks);
        calls.push({ method, values });
      });

  const mockService: MockClackStreamService = {
    calls,
    message: makeMethod("message"),
    info: makeMethod("info"),
    success: makeMethod("success"),
    step: makeMethod("step"),
    warn: makeMethod("warn"),
    error: makeMethod("error"),
  };

  const layer = Layer.succeed(ClackStream, mockService);
  return [layer, mockService];
}
