import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { Output } from "./output.js";
import { makeOutputTestLayer } from "./output-test.js";

describe("makeOutputTestLayer", () => {
  it.effect("records message calls", () => {
    const [layer, mock] = makeOutputTestLayer();
    return Effect.gen(function* () {
      const output = yield* Output;
      yield* output.info("hello");
      yield* output.warn("careful");
      yield* output.error("bad");
      yield* output.success("good");
      yield* output.message("plain");

      expect(mock.calls).toHaveLength(5);
      expect(mock.logs.info).toEqual(["hello"]);
      expect(mock.logs.warn).toEqual(["careful"]);
      expect(mock.logs.error).toEqual(["bad"]);
      expect(mock.logs.success).toEqual(["good"]);
      expect(mock.logs.message).toEqual(["plain"]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records intro, outro, cancel", () => {
    const [layer, mock] = makeOutputTestLayer();
    return Effect.gen(function* () {
      const output = yield* Output;
      yield* output.intro("title");
      yield* output.outro("bye");
      yield* output.cancel("nope");

      expect(mock.calls).toEqual([
        { method: "intro", args: ["title"] },
        { method: "outro", args: ["bye"] },
        { method: "cancel", args: ["nope"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("records note and box calls", () => {
    const [layer, mock] = makeOutputTestLayer();
    return Effect.gen(function* () {
      const output = yield* Output;
      yield* output.note("body", "title");
      yield* output.box("content", "heading", { rounded: true });

      expect(mock.calls[0]).toEqual({ method: "note", args: ["body", "title"] });
      expect(mock.calls[1]).toEqual({
        method: "box",
        args: ["content", "heading", { rounded: true }],
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("records stream calls", () => {
    const [layer, mock] = makeOutputTestLayer();
    return Effect.gen(function* () {
      const output = yield* Output;
      yield* output.stream("info", Stream.make("hello ", "world"));

      expect(mock.calls).toEqual([{ method: "stream", args: ["info", "hello world"] }]);
    }).pipe(Effect.provide(layer));
  });
});
