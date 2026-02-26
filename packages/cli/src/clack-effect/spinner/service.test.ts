import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { ClackSpinner } from "./service.js";
import { makeClackSpinnerTestLayer } from "./test.js";

class TestError extends Data.TaggedError("TestError")<{ readonly message: string }> {}

describe("ClackSpinner", () => {
  it.effect("start returns a handle", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.stop("Done");
      expect(mock.calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.stop", args: ["Done"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("withSpinner calls stop with stopMessage on success", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const result = yield* spinner.withSpinner(
        "Working...",
        () => Effect.succeed(42),
        "All done",
      );
      expect(result).toBe(42);
      expect(mock.calls).toEqual([
        { method: "withSpinner.start", args: ["Working..."] },
        { method: "withSpinner.stop", args: ["All done"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("withSpinner uses start message as stop message when stopMessage is omitted", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      yield* spinner.withSpinner("Working...", () => Effect.succeed("ok"));
      expect(mock.calls).toEqual([
        { method: "withSpinner.start", args: ["Working..."] },
        { method: "withSpinner.stop", args: ["Working..."] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("withSpinner calls error on expected failure", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const result = yield* spinner
        .withSpinner("Working...", () => Effect.fail(new TestError({ message: "boom" })))
        .pipe(Effect.catchAll(() => Effect.succeed("recovered")));
      expect(result).toBe("recovered");
      expect(mock.calls).toEqual([
        { method: "withSpinner.start", args: ["Working..."] },
        { method: "withSpinner.error", args: ["Working..."] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("withSpinner calls cancel on interruption", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const fiber = yield* Effect.fork(
        spinner.withSpinner("Working...", () => Effect.never),
      );
      yield* Effect.yieldNow();
      yield* Fiber.interrupt(fiber);
      yield* Fiber.await(fiber);
      expect(mock.calls).toContainEqual({ method: "withSpinner.cancel", args: [] });
    }).pipe(Effect.provide(layer));
  });

  it.effect("start handle records message calls", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.message("Step 1");
      yield* handle.message("Step 2");
      expect(mock.calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.message", args: ["Step 1"] },
        { method: "handle.message", args: ["Step 2"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("start handle records error calls", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.error("Something failed");
      expect(mock.calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.error", args: ["Something failed"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("start handle records cancel calls", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.cancel("Cancelled");
      expect(mock.calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.cancel", args: ["Cancelled"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("start handle records clear calls", () => {
    const [layer, mock] = makeClackSpinnerTestLayer();
    return Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.clear();
      expect(mock.calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.clear", args: [] },
      ]);
    }).pipe(Effect.provide(layer));
  });
});
