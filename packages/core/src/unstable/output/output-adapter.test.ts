import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { Output } from "./output.js";
import { OutputAdapter } from "./output-adapter.js";
import { TestRenderer, type TestRendererState } from "../cli-renderer/cli-renderer-test.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const setup = (): { readonly layer: Layer.Layer<Output>; readonly state: TestRendererState } => {
  const { layer: rendererLayer, state } = TestRenderer.make();
  const layer = Layer.provide(OutputAdapter, rendererLayer);
  return { layer, state };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OutputAdapter", () => {
  describe("log methods", () => {
    it.effect("message delegates to CliRenderer.message", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.message("hello");
        expect(state.logs).toEqual([{ _tag: "message", message: "hello" }]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("info delegates to CliRenderer.info", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.info("processing");
        expect(state.logs).toEqual([{ _tag: "info", message: "processing" }]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("success delegates to CliRenderer.success", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.success("done");
        expect(state.logs).toEqual([{ _tag: "success", message: "done" }]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("step delegates to CliRenderer.step", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.step("step 1");
        expect(state.logs).toEqual([{ _tag: "step", message: "step 1" }]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("warn delegates to CliRenderer.warn", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.warn("careful");
        expect(state.logs).toEqual([{ _tag: "warn", message: "careful" }]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("error delegates to CliRenderer.error", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.error("bad");
        expect(state.logs).toEqual([{ _tag: "error", message: "bad" }]);
      }).pipe(Effect.provide(layer));
    });
  });

  describe("chrome methods", () => {
    it.effect("intro delegates to CliRenderer.intro", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.intro("My App");
        expect(Option.getOrThrow(state.introTitle)).toBe("My App");
      }).pipe(Effect.provide(layer));
    });

    it.effect("intro with undefined passes empty string", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.intro();
        expect(Option.getOrThrow(state.introTitle)).toBe("");
      }).pipe(Effect.provide(layer));
    });

    it.effect("outro delegates to CliRenderer.outro", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.outro("Goodbye");
        expect(Option.getOrThrow(state.outroMessage)).toBe("Goodbye");
      }).pipe(Effect.provide(layer));
    });

    it.effect("outro with undefined passes empty string", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.outro();
        expect(Option.getOrThrow(state.outroMessage)).toBe("");
      }).pipe(Effect.provide(layer));
    });

    it.effect("cancel delegates to CliRenderer.cancel", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.cancel("aborted");
        expect(state.cancelMessages).toEqual(["aborted"]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("note delegates to CliRenderer.note", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.note("body", "Title");
        expect(state.notes).toEqual([{ message: "body", title: "Title" }]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("box delegates to CliRenderer.box", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.box("content", "heading");
        expect(state.boxes).toEqual([{ message: "content", title: "heading" }]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("box maps BoxOptions properties", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.box("content", "heading", {
          contentAlign: "center",
          titleAlign: "left",
          width: 80,
          contentPadding: 2,
          rounded: true,
        });
        expect(state.boxes).toEqual([
          {
            message: "content",
            title: "heading",
            opts: {
              contentAlignment: "center",
              titleAlignment: "left",
              width: 80,
              padding: 2,
              rounded: true,
            },
          },
        ]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("box with width 'auto' omits width from renderer options", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.box("content", "heading", { width: "auto" });
        expect(state.boxes).toEqual([
          {
            message: "content",
            title: "heading",
            opts: {},
          },
        ]);
      }).pipe(Effect.provide(layer));
    });
  });

  describe("stream", () => {
    it.effect("stream delegates to CliRenderer.streamLog", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.stream("info", Stream.make("hello ", "world"));
        expect(state.logs).toEqual([{ _tag: "info", message: "hello world" }]);
      }).pipe(Effect.provide(layer));
    });
  });
});
