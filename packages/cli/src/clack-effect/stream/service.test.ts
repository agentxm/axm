import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Stream from "effect/Stream";
import { ClackStream } from "./service.js";
import { ClackStreamTest, ClackStreamTestLayer } from "./ClackStreamTest.js";

class TestStreamError extends Data.TaggedError("TestStreamError")<{
  readonly message: string;
}> {}

describe("ClackStream", () => {
  it.effect("message consumes stream values", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.message(Stream.make("hello", "world"));
      const calls = yield* (yield* ClackStreamTest).get;
      expect(calls).toEqual([{ method: "message", values: ["hello", "world"] }]);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );

  it.effect("info consumes stream values", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.info(Stream.make("info msg"));
      const calls = yield* (yield* ClackStreamTest).get;
      expect(calls).toEqual([{ method: "info", values: ["info msg"] }]);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );

  it.effect("success consumes stream values", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.success(Stream.make("done"));
      const calls = yield* (yield* ClackStreamTest).get;
      expect(calls).toEqual([{ method: "success", values: ["done"] }]);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );

  it.effect("step consumes stream values", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.step(Stream.make("step 1"));
      const calls = yield* (yield* ClackStreamTest).get;
      expect(calls).toEqual([{ method: "step", values: ["step 1"] }]);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );

  it.effect("warn consumes stream values", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.warn(Stream.make("caution"));
      const calls = yield* (yield* ClackStreamTest).get;
      expect(calls).toEqual([{ method: "warn", values: ["caution"] }]);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );

  it.effect("error consumes stream values", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.error(Stream.make("failure"));
      const calls = yield* (yield* ClackStreamTest).get;
      expect(calls).toEqual([{ method: "error", values: ["failure"] }]);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );

  it.effect("stream errors propagate", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      const failing = Stream.fail(new TestStreamError({ message: "stream broke" }));
      const exit = yield* stream.error(failing).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );

  it.effect("empty stream passes empty array", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.info(Stream.empty);
      const calls = yield* (yield* ClackStreamTest).get;
      expect(calls).toEqual([{ method: "info", values: [] }]);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );

  it.effect("multiple calls are tracked in order", () =>
    Effect.gen(function* () {
      const stream = yield* ClackStream;
      yield* stream.info(Stream.make("first"));
      yield* stream.warn(Stream.make("second"));
      yield* stream.success(Stream.make("third"));
      const calls = yield* (yield* ClackStreamTest).get;
      expect(calls).toEqual([
        { method: "info", values: ["first"] },
        { method: "warn", values: ["second"] },
        { method: "success", values: ["third"] },
      ]);
    }).pipe(Effect.provide(ClackStreamTestLayer)),
  );
});
