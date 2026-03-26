import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { Activity } from "./activity.js";
import { ActivityTest, ActivityTestLayer, makeActivityTestLayer } from "./activity-test.js";
import { at } from "../test-helpers.js";

class TestError extends Data.TaggedError("TestError")<{ readonly message: string }> {}

describe("ActivityTestLayer", () => {
  describe("startSpinner", () => {
    it.effect("returns a handle and records the start call", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        yield* handle.stop("Done");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "startSpinner", args: ["Loading..."] },
          { method: "handle.stop", args: ["Done"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("records message calls on the handle", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Working...");
        yield* handle.message("Step 1");
        yield* handle.message("Step 2");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "startSpinner", args: ["Working..."] },
          { method: "handle.message", args: ["Step 1"] },
          { method: "handle.message", args: ["Step 2"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("records error calls on the handle", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        yield* handle.error("Something failed");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "startSpinner", args: ["Loading..."] },
          { method: "handle.error", args: ["Something failed"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("records cancel calls on the handle", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        yield* handle.cancel("Cancelled");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "startSpinner", args: ["Loading..."] },
          { method: "handle.cancel", args: ["Cancelled"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("records clear calls on the handle", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        yield* handle.clear();
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "startSpinner", args: ["Loading..."] },
          { method: "handle.clear", args: [] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );
  });

  describe("withSpinner", () => {
    it.effect("calls stop with stopMessage on success", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withSpinner(
          "Working...",
          () => Effect.succeed(42),
          "All done",
        );
        expect(result).toBe(42);
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withSpinner.start", args: ["Working..."] },
          { method: "withSpinner.stop", args: ["All done"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("uses start message as stop message when stopMessage is omitted", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.withSpinner("Working...", () => Effect.succeed("ok"));
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withSpinner.start", args: ["Working..."] },
          { method: "withSpinner.stop", args: ["Working..."] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("calls error on expected failure", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity
          .withSpinner("Working...", () => Effect.fail(new TestError({ message: "boom" })))
          .pipe(Effect.catch(() => Effect.succeed("recovered")));
        expect(result).toBe("recovered");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withSpinner.start", args: ["Working..."] },
          { method: "withSpinner.error", args: ["Working..."] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("calls cancel on interruption", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const fiber = yield* Effect.forkChild(
          activity.withSpinner("Working...", () => Effect.never),
        );
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(fiber);
        yield* Fiber.await(fiber);
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toContainEqual({ method: "withSpinner.cancel", args: [] });
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("supports successMessage function in options", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.withSpinner("Working...", () => Effect.succeed(42), {
          successMessage: (n: number) => `Done: ${n}`,
        });
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withSpinner.start", args: ["Working..."] },
          { method: "withSpinner.stop", args: ["Done: 42"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );
  });

  describe("startProgress", () => {
    it.effect("returns a handle with advance", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startProgress({ max: 100 }, "Downloading...");
        yield* handle.advance(50, "Half done");
        yield* handle.stop("Complete");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "startProgress", args: [{ max: 100 }, "Downloading..."] },
          { method: "handle.advance", args: [50, "Half done"] },
          { method: "handle.stop", args: ["Complete"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );
  });

  describe("withProgress", () => {
    it.effect("calls stop with stopMessage on success", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withProgress(
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
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withProgress.start", args: [{ max: 10 }, "Processing..."] },
          { method: "handle.advance", args: [5, undefined] },
          { method: "handle.advance", args: [5, undefined] },
          { method: "withProgress.stop", args: ["All done"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("uses start message as stop message when stopMessage is omitted", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.withProgress({ max: 5 }, "Working...", () => Effect.succeed("ok"));
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withProgress.start", args: [{ max: 5 }, "Working..."] },
          { method: "withProgress.stop", args: ["Working..."] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("calls error on expected failure", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity
          .withProgress({ max: 10 }, "Working...", () =>
            Effect.fail(new TestError({ message: "boom" })),
          )
          .pipe(Effect.catch(() => Effect.succeed("recovered")));
        expect(result).toBe("recovered");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withProgress.start", args: [{ max: 10 }, "Working..."] },
          { method: "withProgress.error", args: ["Working..."] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("calls cancel on interruption", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const fiber = yield* Effect.forkChild(
          activity.withProgress({ max: 100 }, "Working...", () => Effect.never),
        );
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(fiber);
        yield* Fiber.await(fiber);
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toContainEqual({ method: "withProgress.cancel", args: [] });
      }).pipe(Effect.provide(ActivityTestLayer)),
    );
  });

  describe("startTaskLog", () => {
    it.effect("returns a handle", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startTaskLog({ title: "Building" });
        expect(handle).toBeDefined();
        expect(handle.message).toBeTypeOf("function");
        expect(handle.group).toBeTypeOf("function");
        expect(handle.error).toBeTypeOf("function");
        expect(handle.success).toBeTypeOf("function");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([{ method: "startTaskLog", args: [{ title: "Building" }] }]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("handle.message records calls", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startTaskLog({ title: "Installing" });
        yield* handle.message("step 1");
        yield* handle.message("step 2");
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "startTaskLog", args: [{ title: "Installing" }] },
          { method: "taskLog.message", args: ["step 1"] },
          { method: "taskLog.message", args: ["step 2"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("handle.group returns a group handle that records calls", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startTaskLog({ title: "Build" });
        const group = yield* handle.group("dependencies");
        yield* group.message("installing pkg");
        yield* group.error("failed to install");
        yield* group.success("installed");
        const record = yield* (yield* ActivityTest).get;
        expect(record.groups).toHaveLength(1);
        const groupRecord = at(record.groups, 0);
        expect(groupRecord.name).toBe("dependencies");
        expect(groupRecord.calls).toEqual([
          { method: "message", args: ["installing pkg"] },
          { method: "error", args: ["failed to install"] },
          { method: "success", args: ["installed"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );
  });

  describe("withTaskLog", () => {
    it.effect("provides handle and records calls", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.withTaskLog({ title: "Build" }, (handle) =>
          Effect.gen(function* () {
            yield* handle.message("compiling");
            yield* handle.success("done");
          }),
        );
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toContainEqual({
          method: "withTaskLog",
          args: [{ title: "Build" }],
        });
        expect(calls).toContainEqual({
          method: "taskLog.message",
          args: ["compiling"],
        });
        expect(calls).toContainEqual({
          method: "taskLog.success",
          args: ["done"],
        });
      }).pipe(Effect.provide(ActivityTestLayer)),
    );
  });

  describe("runTasks", () => {
    it.effect("executes tasks sequentially", () => {
      const order: string[] = [];
      return Effect.gen(function* () {
        const activity = yield* Activity;
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
          {
            title: "Task C",
            task: () =>
              Effect.sync(() => {
                order.push("C");
              }),
          },
        ]);
        expect(order).toEqual(["A", "B", "C"]);
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls.filter((c) => c.method === "withSpinner.start")).toEqual([
          { method: "withSpinner.start", args: ["Task A"] },
          { method: "withSpinner.start", args: ["Task B"] },
          { method: "withSpinner.start", args: ["Task C"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer));
    });

    it.effect("propagates task errors through the Effect channel", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity
          .runTasks([
            {
              title: "Failing task",
              task: () => Effect.fail(new TestError({ message: "boom" })),
            },
          ])
          .pipe(
            Effect.matchEffect({
              onFailure: (e) => Effect.succeed(e),
              onSuccess: () => Effect.succeed(null),
            }),
          );
        expect(result).toBeInstanceOf(TestError);
        if (!(result instanceof TestError)) {
          throw new Error("Expected TestError");
        }
        expect(result.message).toBe("boom");
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("skips tasks with enabled set to false", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.runTasks([
          { title: "Enabled", task: () => Effect.succeed("done") },
          { title: "Disabled", enabled: false, task: () => Effect.succeed("skipped") },
          { title: "Also enabled", task: () => Effect.succeed("also done") },
        ]);
        const { calls } = yield* (yield* ActivityTest).get;
        const starts = calls.filter((c) => c.method === "withSpinner.start");
        expect(starts).toEqual([
          { method: "withSpinner.start", args: ["Enabled"] },
          { method: "withSpinner.start", args: ["Also enabled"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("falls back to task title when task returns void", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.runTasks([{ title: "Void task", task: () => Effect.void }]);
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withSpinner.start", args: ["Void task"] },
          { method: "withSpinner.stop", args: ["Void task"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );

    it.effect("message callback updates spinner message", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.runTasks([
          {
            title: "Downloading",
            task: (message) =>
              Effect.gen(function* () {
                yield* message("50% complete");
                yield* message("100% complete");
                return "Downloaded";
              }),
          },
        ]);
        const { calls } = yield* (yield* ActivityTest).get;
        expect(calls).toEqual([
          { method: "withSpinner.start", args: ["Downloading"] },
          { method: "handle.message", args: ["50% complete"] },
          { method: "handle.message", args: ["100% complete"] },
          { method: "withSpinner.stop", args: ["Downloading"] },
        ]);
      }).pipe(Effect.provide(ActivityTestLayer)),
    );
  });

  describe("makeActivityTestLayer mutable mock", () => {
    it.effect("populates mock.calls alongside ref", () => {
      const [layer, mock] = makeActivityTestLayer();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.withSpinner("Test", () => Effect.succeed("ok"));
        expect(mock.calls.length).toBeGreaterThan(0);
        expect(mock.starts).toContain("Test");
        expect(mock.stops).toContain("Test");
      }).pipe(Effect.provide(layer));
    });
  });
});
