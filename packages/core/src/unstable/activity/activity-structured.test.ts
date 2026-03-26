import * as Console from "effect/Console";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Activity } from "./activity.js";
import { ActivityStructured } from "./activity-structured.js";
import { at } from "../test-helpers.js";

/** Create a Console layer that captures log calls. */
const makeCaptureConsole = () => {
  const lines: string[] = [];
  const consoleLayer = Layer.succeed(Console.Console, {
    ...console,
    log: (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    },
  });
  return { lines, consoleLayer };
};

describe("ActivityStructured", () => {
  describe("json mode", () => {
    const layer = ActivityStructured("json");

    it.effect("startSpinner returns a noop handle in json mode", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        // noop handle — no events emitted
        yield* handle.stop("Done");
        yield* handle.message("step");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("withSpinner runs the effect with noop handle in json mode", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withSpinner(
          "Working...",
          () => Effect.succeed(42),
          "All done",
        );
        expect(result).toBe(42);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("startProgress returns a noop handle in json mode", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startProgress({ max: 100 }, "Downloading...");
        yield* handle.advance(50, "step");
        yield* handle.stop("Done");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("withProgress runs the effect with noop handle in json mode", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withProgress({ max: 10 }, "Processing...", () =>
          Effect.succeed(42),
        );
        expect(result).toBe(42);
      }).pipe(Effect.provide(layer)),
    );

    it.effect("startTaskLog returns a structured handle", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startTaskLog({ title: "Build" });
        expect(handle.message).toBeTypeOf("function");
        expect(handle.group).toBeTypeOf("function");
      }).pipe(Effect.provide(layer)),
    );

    it.effect("runTasks runs tasks with noop spinners in json mode", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const order: string[] = [];
        yield* activity.runTasks([
          {
            title: "Task A",
            task: () =>
              Effect.sync(() => {
                order.push("A");
              }),
          },
          {
            title: "Task B",
            task: () =>
              Effect.sync(() => {
                order.push("B");
              }),
          },
        ]);
        expect(order).toEqual(["A", "B"]);
      }).pipe(Effect.provide(layer)),
    );
  });

  describe("stream-json mode", () => {
    const activityLayer = ActivityStructured("stream-json");

    it.effect("startSpinner emits a progress event in stream-json mode", () => {
      const { lines, consoleLayer } = makeCaptureConsole();
      const layer = Layer.merge(activityLayer, consoleLayer);
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        expect(lines.length).toBeGreaterThan(0);
        const event = JSON.parse(at(lines, 0));
        expect(event).toEqual({
          type: "progress",
          phase: "start",
          percent: 0,
          message: "Loading...",
        });
        yield* handle.stop("Done");
        const stopEvent = JSON.parse(at(lines, lines.length - 1));
        expect(stopEvent.type).toBe("progress");
        expect(stopEvent.percent).toBe(100);
      }).pipe(Effect.provide(layer));
    });

    it.effect("withSpinner emits progress events in stream-json mode", () => {
      const { lines, consoleLayer } = makeCaptureConsole();
      const layer = Layer.merge(activityLayer, consoleLayer);
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withSpinner(
          "Working...",
          () => Effect.succeed(42),
          "All done",
        );
        expect(result).toBe(42);
        expect(lines.length).toBeGreaterThanOrEqual(2);
        const startEvent = JSON.parse(at(lines, 0));
        expect(startEvent).toEqual({
          type: "progress",
          phase: "work",
          percent: 0,
          message: "Working...",
        });
        const endEvent = JSON.parse(at(lines, lines.length - 1));
        expect(endEvent).toEqual({
          type: "progress",
          phase: "work",
          percent: 100,
          message: "All done",
        });
      }).pipe(Effect.provide(layer));
    });

    it.effect("withProgress emits progress events in stream-json mode", () => {
      const { lines, consoleLayer } = makeCaptureConsole();
      const layer = Layer.merge(activityLayer, consoleLayer);
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withProgress(
          { max: 10 },
          "Processing...",
          (handle) =>
            Effect.gen(function* () {
              yield* handle.advance(5, "Halfway");
              return 42;
            }),
          "All done",
        );
        expect(result).toBe(42);
        expect(lines.length).toBeGreaterThanOrEqual(2);
        const startEvent = JSON.parse(at(lines, 0));
        expect(startEvent).toEqual({
          type: "progress",
          phase: "progress",
          percent: 0,
          message: "Processing...",
        });
      }).pipe(Effect.provide(layer));
    });

    it.effect("runTasks runs tasks with stream-json spinners", () => {
      const { lines, consoleLayer } = makeCaptureConsole();
      const layer = Layer.merge(activityLayer, consoleLayer);
      return Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.runTasks([{ title: "Task A", task: () => Effect.succeed("done") }]);
        expect(lines.length).toBeGreaterThan(0);
        const events = lines.map((l) => JSON.parse(l));
        expect(at(events, 0)).toEqual({
          type: "progress",
          phase: "work",
          percent: 0,
          message: "Task A",
        });
      }).pipe(Effect.provide(layer));
    });
  });
});
