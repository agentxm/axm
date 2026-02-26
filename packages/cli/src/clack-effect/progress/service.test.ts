import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { ClackProgress } from "./service.js";
import { makeClackProgressTestLayer } from "./test.js";

class TestError extends Data.TaggedError("TestError")<{ readonly message: string }> {}

describe("ClackProgress", () => {
  it.effect("start returns a handle with advance", () => {
    const [layer, mock] = makeClackProgressTestLayer();
    return Effect.gen(function* () {
      const progress = yield* ClackProgress;
      const handle = yield* progress.start({ max: 100 }, "Downloading...");
      yield* handle.advance(50, "Half done");
      yield* handle.stop("Complete");
      expect(mock.calls).toEqual([
        { method: "start", args: [{ max: 100 }, "Downloading..."] },
        { method: "handle.advance", args: [50, "Half done"] },
        { method: "handle.stop", args: ["Complete"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("withProgress calls stop with stopMessage on success", () => {
    const [layer, mock] = makeClackProgressTestLayer();
    return Effect.gen(function* () {
      const progress = yield* ClackProgress;
      const result = yield* progress.withProgress(
        { max: 10 },
        "Processing...",
        (handle) =>
          Effect.gen(function* () {
            yield* handle.advance(5);
            yield* handle.advance(5);
            return 42;
          }),
        "All done",
      );
      expect(result).toBe(42);
      expect(mock.calls).toEqual([
        { method: "withProgress.start", args: [{ max: 10 }, "Processing..."] },
        { method: "handle.advance", args: [5, undefined] },
        { method: "handle.advance", args: [5, undefined] },
        { method: "withProgress.stop", args: ["All done"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("withProgress uses start message as stop message when stopMessage is omitted", () => {
    const [layer, mock] = makeClackProgressTestLayer();
    return Effect.gen(function* () {
      const progress = yield* ClackProgress;
      yield* progress.withProgress({ max: 5 }, "Working...", () => Effect.succeed("ok"));
      expect(mock.calls).toEqual([
        { method: "withProgress.start", args: [{ max: 5 }, "Working..."] },
        { method: "withProgress.stop", args: ["Working..."] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("withProgress calls error on expected failure", () => {
    const [layer, mock] = makeClackProgressTestLayer();
    return Effect.gen(function* () {
      const progress = yield* ClackProgress;
      const result = yield* progress
        .withProgress({ max: 10 }, "Working...", () =>
          Effect.fail(new TestError({ message: "boom" })),
        )
        .pipe(Effect.catchAll(() => Effect.succeed("recovered")));
      expect(result).toBe("recovered");
      expect(mock.calls).toEqual([
        { method: "withProgress.start", args: [{ max: 10 }, "Working..."] },
        { method: "withProgress.error", args: ["Working..."] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("withProgress calls cancel on interruption", () => {
    const [layer, mock] = makeClackProgressTestLayer();
    return Effect.gen(function* () {
      const progress = yield* ClackProgress;
      const fiber = yield* Effect.fork(
        progress.withProgress({ max: 100 }, "Working...", () => Effect.never),
      );
      yield* Effect.yieldNow();
      yield* Fiber.interrupt(fiber);
      yield* Fiber.await(fiber);
      expect(mock.calls).toContainEqual({ method: "withProgress.cancel", args: [] });
    }).pipe(Effect.provide(layer));
  });

  it.effect("start handle records message calls", () => {
    const [layer, mock] = makeClackProgressTestLayer();
    return Effect.gen(function* () {
      const progress = yield* ClackProgress;
      const handle = yield* progress.start({}, "Loading...");
      yield* handle.message("Step 1");
      expect(mock.calls).toEqual([
        { method: "start", args: [{}, "Loading..."] },
        { method: "handle.message", args: ["Step 1"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("start handle records error calls", () => {
    const [layer, mock] = makeClackProgressTestLayer();
    return Effect.gen(function* () {
      const progress = yield* ClackProgress;
      const handle = yield* progress.start({}, "Loading...");
      yield* handle.error("Something failed");
      expect(mock.calls).toEqual([
        { method: "start", args: [{}, "Loading..."] },
        { method: "handle.error", args: ["Something failed"] },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("start handle records cancel and clear calls", () => {
    const [layer, mock] = makeClackProgressTestLayer();
    return Effect.gen(function* () {
      const progress = yield* ClackProgress;
      const handle = yield* progress.start({}, "Loading...");
      yield* handle.cancel("Aborted");
      yield* handle.clear();
      expect(mock.calls).toEqual([
        { method: "start", args: [{}, "Loading..."] },
        { method: "handle.cancel", args: ["Aborted"] },
        { method: "handle.clear", args: [] },
      ]);
    }).pipe(Effect.provide(layer));
  });
});
