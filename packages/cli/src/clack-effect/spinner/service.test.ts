import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { ClackSpinner } from "./service.js";
import { ClackSpinnerTest, ClackSpinnerTestLayer } from "./ClackSpinnerTest.js";

class TestError extends Data.TaggedError("TestError")<{ readonly message: string }> {}

describe("ClackSpinner", () => {
  it.effect("start returns a handle", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.stop("Done");
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.stop", args: ["Done"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );

  it.effect("withSpinner calls stop with stopMessage on success", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const result = yield* spinner.withSpinner("Working...", () => Effect.succeed(42), "All done");
      expect(result).toBe(42);
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "withSpinner.start", args: ["Working..."] },
        { method: "withSpinner.stop", args: ["All done"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );

  it.effect("withSpinner uses start message as stop message when stopMessage is omitted", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      yield* spinner.withSpinner("Working...", () => Effect.succeed("ok"));
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "withSpinner.start", args: ["Working..."] },
        { method: "withSpinner.stop", args: ["Working..."] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );

  it.effect("withSpinner calls error on expected failure", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const result = yield* spinner
        .withSpinner("Working...", () => Effect.fail(new TestError({ message: "boom" })))
        .pipe(Effect.catch(() => Effect.succeed("recovered")));
      expect(result).toBe("recovered");
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "withSpinner.start", args: ["Working..."] },
        { method: "withSpinner.error", args: ["Working..."] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );

  it.effect("withSpinner calls cancel on interruption", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const fiber = yield* Effect.forkChild(spinner.withSpinner("Working...", () => Effect.never));
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);
      yield* Fiber.await(fiber);
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toContainEqual({ method: "withSpinner.cancel", args: [] });
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );

  it.effect("start handle records message calls", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.message("Step 1");
      yield* handle.message("Step 2");
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.message", args: ["Step 1"] },
        { method: "handle.message", args: ["Step 2"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );

  it.effect("start handle records error calls", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.error("Something failed");
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.error", args: ["Something failed"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );

  it.effect("start handle records cancel calls", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.cancel("Cancelled");
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.cancel", args: ["Cancelled"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );

  it.effect("start handle records clear calls", () =>
    Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      const handle = yield* spinner.start("Loading...");
      yield* handle.clear();
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "start", args: ["Loading..."] },
        { method: "handle.clear", args: [] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer)),
  );
});
