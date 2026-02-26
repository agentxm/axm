import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Stream from "effect/Stream";
import { ClackStream } from "./service.js";

class TestStreamError extends Data.TaggedError("TestStreamError")<{
  readonly message: string;
}> {}
import { makeClackStreamTestLayer } from "./test.js";

describe("ClackStream", () => {
  it.effect("message consumes stream values", () => {
    const [layer, mock] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.message(Stream.make("hello", "world"));
      expect(mock.calls).toEqual([{ method: "message", values: ["hello", "world"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("info consumes stream values", () => {
    const [layer, mock] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.info(Stream.make("info msg"));
      expect(mock.calls).toEqual([{ method: "info", values: ["info msg"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("success consumes stream values", () => {
    const [layer, mock] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.success(Stream.make("done"));
      expect(mock.calls).toEqual([{ method: "success", values: ["done"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("step consumes stream values", () => {
    const [layer, mock] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.step(Stream.make("step 1"));
      expect(mock.calls).toEqual([{ method: "step", values: ["step 1"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("warn consumes stream values", () => {
    const [layer, mock] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.warn(Stream.make("caution"));
      expect(mock.calls).toEqual([{ method: "warn", values: ["caution"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("error consumes stream values", () => {
    const [layer, mock] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.error(Stream.make("failure"));
      expect(mock.calls).toEqual([{ method: "error", values: ["failure"] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("stream errors propagate", () => {
    const [layer] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      const failing = Stream.fail(new TestStreamError({ message: "stream broke" }));
      const exit = yield* stream.error(failing).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("empty stream passes empty array", () => {
    const [layer, mock] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.info(Stream.empty);
      expect(mock.calls).toEqual([{ method: "info", values: [] }]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("multiple calls are tracked in order", () => {
    const [layer, mock] = makeClackStreamTestLayer();
    return Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.info(Stream.make("first"));
      yield* stream.warn(Stream.make("second"));
      yield* stream.success(Stream.make("third"));
      expect(mock.calls).toEqual([
        { method: "info", values: ["first"] },
        { method: "warn", values: ["second"] },
        { method: "success", values: ["third"] },
      ]);
    }).pipe(Effect.provide(layer));
  });
});
