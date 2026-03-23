import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { ClackSpinnerTest, ClackSpinnerTestLayer } from "./spinner/ClackSpinnerTest.js";
import { runTasks, type ClackTask } from "./tasks.js";

class TestError extends Data.TaggedError("TestError")<{ readonly message: string }> {}

describe("runTasks", () => {
  it.effect("executes tasks sequentially", () => {
    const order: string[] = [];
    const tasks: ReadonlyArray<ClackTask<never, never>> = [
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
    ];
    return Effect.gen(function* () {
      yield* runTasks(tasks);
      expect(order).toEqual(["A", "B", "C"]);
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls.filter((c) => c.method === "withSpinner.start")).toEqual([
        { method: "withSpinner.start", args: ["Task A"] },
        { method: "withSpinner.start", args: ["Task B"] },
        { method: "withSpinner.start", args: ["Task C"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer));
  });

  it.effect("propagates task errors through the Effect channel", () => {
    const tasks: ReadonlyArray<ClackTask<TestError, never>> = [
      {
        title: "Failing task",
        task: () => Effect.fail(new TestError({ message: "boom" })),
      },
    ];
    return Effect.gen(function* () {
      const result = yield* runTasks(tasks).pipe(
        Effect.matchEffect({
          onFailure: (e) => Effect.succeed(e),
          onSuccess: () => Effect.succeed(null),
        }),
      );
      expect(result).toBeInstanceOf(TestError);
      expect((result as TestError).message).toBe("boom");
    }).pipe(Effect.provide(ClackSpinnerTestLayer));
  });

  it.effect("skips tasks with enabled set to false", () => {
    const tasks: ReadonlyArray<ClackTask<never, never>> = [
      { title: "Enabled", task: () => Effect.succeed("done") },
      { title: "Disabled", enabled: false, task: () => Effect.succeed("skipped") },
      { title: "Also enabled", task: () => Effect.succeed("also done") },
    ];
    return Effect.gen(function* () {
      yield* runTasks(tasks);
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      const starts = calls.filter((c) => c.method === "withSpinner.start");
      expect(starts).toEqual([
        { method: "withSpinner.start", args: ["Enabled"] },
        { method: "withSpinner.start", args: ["Also enabled"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer));
  });

  it.effect("spinner auto-cleanup via withSpinner on success", () => {
    const tasks: ReadonlyArray<ClackTask<never, never>> = [
      { title: "My task", task: () => Effect.succeed("result") },
    ];
    return Effect.gen(function* () {
      yield* runTasks(tasks);
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "withSpinner.start", args: ["My task"] },
        { method: "withSpinner.stop", args: ["My task"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer));
  });

  it.effect("spinner auto-cleanup via withSpinner on error", () => {
    const tasks: ReadonlyArray<ClackTask<TestError, never>> = [
      { title: "Failing", task: () => Effect.fail(new TestError({ message: "fail" })) },
    ];
    return Effect.gen(function* () {
      yield* runTasks(tasks).pipe(Effect.catch(() => Effect.void));
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "withSpinner.start", args: ["Failing"] },
        { method: "withSpinner.error", args: ["Failing"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer));
  });

  it.effect("falls back to task title when task returns void", () => {
    const tasks: ReadonlyArray<ClackTask<never, never>> = [
      { title: "Void task", task: () => Effect.void },
    ];
    return Effect.gen(function* () {
      yield* runTasks(tasks);
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "withSpinner.start", args: ["Void task"] },
        { method: "withSpinner.stop", args: ["Void task"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer));
  });

  it.effect("message callback updates spinner message", () => {
    const tasks: ReadonlyArray<ClackTask<never, never>> = [
      {
        title: "Downloading",
        task: (message) =>
          Effect.gen(function* () {
            yield* message("50% complete");
            yield* message("100% complete");
            return "Downloaded";
          }),
      },
    ];
    return Effect.gen(function* () {
      yield* runTasks(tasks);
      const { calls } = yield* (yield* ClackSpinnerTest).get;
      expect(calls).toEqual([
        { method: "withSpinner.start", args: ["Downloading"] },
        { method: "handle.message", args: ["50% complete"] },
        { method: "handle.message", args: ["100% complete"] },
        { method: "withSpinner.stop", args: ["Downloading"] },
      ]);
    }).pipe(Effect.provide(ClackSpinnerTestLayer));
  });
});
