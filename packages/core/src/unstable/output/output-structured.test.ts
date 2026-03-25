import { describe, expect, it } from "@effect/vitest";
import * as Console from "effect/Console";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { Output } from "./output.js";
import { OutputStructured } from "./output-structured.js";

describe("OutputStructured", () => {
  describe("stream-json mode", () => {
    const layer = OutputStructured("stream-json");

    it.effect("emits log events as NDJSON for info", () => {
      const lines: Array<string> = [];
      const testLayer = Layer.merge(
        layer,
        Layer.succeed(Console.Console, {
          ...console,
          log: (...args: ReadonlyArray<unknown>) => lines.push(args.map(String).join(" ")),
        }),
      );

      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.info("hello world");

        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
        expect(parsed).toEqual({ type: "log", level: "info", message: "hello world" });
      }).pipe(Effect.provide(testLayer));
    });

    it.effect("emits warn events with warn level", () => {
      const lines: Array<string> = [];
      const testLayer = Layer.merge(
        layer,
        Layer.succeed(Console.Console, {
          ...console,
          log: (...args: ReadonlyArray<unknown>) => lines.push(args.map(String).join(" ")),
        }),
      );

      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.warn("be careful");

        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
        expect(parsed).toEqual({ type: "log", level: "warn", message: "be careful" });
      }).pipe(Effect.provide(testLayer));
    });

    it.effect("emits error events with error level", () => {
      const lines: Array<string> = [];
      const testLayer = Layer.merge(
        layer,
        Layer.succeed(Console.Console, {
          ...console,
          log: (...args: ReadonlyArray<unknown>) => lines.push(args.map(String).join(" ")),
        }),
      );

      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.error("something broke");

        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
        expect(parsed).toEqual({ type: "log", level: "error", message: "something broke" });
      }).pipe(Effect.provide(testLayer));
    });

    it.effect("emits nothing for intro with no title", () => {
      const lines: Array<string> = [];
      const testLayer = Layer.merge(
        layer,
        Layer.succeed(Console.Console, {
          ...console,
          log: (...args: ReadonlyArray<unknown>) => lines.push(args.map(String).join(" ")),
        }),
      );

      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.intro();

        expect(lines).toHaveLength(0);
      }).pipe(Effect.provide(testLayer));
    });

    it.effect("collects stream and emits as log event", () => {
      const lines: Array<string> = [];
      const testLayer = Layer.merge(
        layer,
        Layer.succeed(Console.Console, {
          ...console,
          log: (...args: ReadonlyArray<unknown>) => lines.push(args.map(String).join(" ")),
        }),
      );

      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.stream("info", Stream.make("hello ", "world"));

        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
        expect(parsed).toEqual({ type: "log", level: "info", message: "hello world" });
      }).pipe(Effect.provide(testLayer));
    });

    it.effect("formats note with title prefix", () => {
      const lines: Array<string> = [];
      const testLayer = Layer.merge(
        layer,
        Layer.succeed(Console.Console, {
          ...console,
          log: (...args: ReadonlyArray<unknown>) => lines.push(args.map(String).join(" ")),
        }),
      );

      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.note("body text", "Note Title");

        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
        expect(parsed).toEqual({ type: "log", level: "info", message: "Note Title: body text" });
      }).pipe(Effect.provide(testLayer));
    });
  });

  describe("json mode", () => {
    const layer = OutputStructured("json");

    it.effect("routes info to stderr", () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      return Effect.gen(function* () {
        const output = yield* Output;
        yield* output.info("stderr message");

        expect(stderrSpy).toHaveBeenCalledWith("stderr message");
      }).pipe(
        Effect.provide(layer),
        Effect.ensuring(
          Effect.sync(() => {
            stderrSpy.mockRestore();
          }),
        ),
      );
    });
  });
});
