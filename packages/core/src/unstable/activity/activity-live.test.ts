import { describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import { Activity } from "./activity.js";
import { ActivityLive } from "./activity-live.js";

// Mock @clack/prompts
vi.mock("@clack/prompts", () => {
  const makeSpinnerResult = () => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
    cancel: vi.fn(),
    error: vi.fn(),
    clear: vi.fn(),
  });

  const makeProgressResult = () => ({
    ...makeSpinnerResult(),
    advance: vi.fn(),
  });

  const makeTaskLogResult = () => ({
    message: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    group: vi.fn().mockReturnValue({
      message: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    }),
  });

  return {
    spinner: vi.fn().mockReturnValue(makeSpinnerResult()),
    progress: vi.fn().mockReturnValue(makeProgressResult()),
    taskLog: vi.fn().mockReturnValue(makeTaskLogResult()),
  };
});

const clack = (await import("@clack/prompts")) as unknown as typeof import("@clack/prompts");

describe("ActivityLive", () => {
  describe("startSpinner", () => {
    it.effect("creates a spinner and starts it", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        expect(clack.spinner).toHaveBeenCalled();
        const spinnerResult = (clack.spinner as ReturnType<typeof vi.fn>).mock.results[0]!.value;
        expect(spinnerResult.start).toHaveBeenCalledWith("Loading...");
        yield* handle.stop("Done");
        expect(spinnerResult.stop).toHaveBeenCalledWith("Done");
      }).pipe(Effect.provide(ActivityLive)),
    );
  });

  describe("withSpinner", () => {
    it.effect("runs the effect and stops the spinner on success", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withSpinner(
          "Working...",
          () => Effect.succeed(42),
          "All done",
        );
        expect(result).toBe(42);
        const spinnerResult = (clack.spinner as ReturnType<typeof vi.fn>).mock.results[0]!.value;
        expect(spinnerResult.start).toHaveBeenCalledWith("Working...");
        expect(spinnerResult.stop).toHaveBeenCalledWith("All done");
      }).pipe(Effect.provide(ActivityLive)),
    );

    it.effect("calls error on failure", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity
          .withSpinner("Working...", () => Effect.fail("boom"))
          .pipe(Effect.catch(() => Effect.succeed("recovered")));
        const spinnerResult = (clack.spinner as ReturnType<typeof vi.fn>).mock.results[0]!.value;
        expect(spinnerResult.error).toHaveBeenCalledWith("Working...");
      }).pipe(Effect.provide(ActivityLive)),
    );
  });

  describe("startProgress", () => {
    it.effect("creates progress and starts it", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startProgress({ max: 100 }, "Downloading...");
        expect(clack.progress).toHaveBeenCalledWith({ max: 100 });
        const progressResult = (clack.progress as ReturnType<typeof vi.fn>).mock.results[0]!.value;
        expect(progressResult.start).toHaveBeenCalledWith("Downloading...");
        yield* handle.advance(50, "Half done");
        expect(progressResult.advance).toHaveBeenCalledWith(50, "Half done");
      }).pipe(Effect.provide(ActivityLive)),
    );
  });

  describe("withProgress", () => {
    it.effect("runs the effect and stops progress on success", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withProgress(
          { max: 10 },
          "Processing...",
          () => Effect.succeed(42),
          "All done",
        );
        expect(result).toBe(42);
        const progressResult = (clack.progress as ReturnType<typeof vi.fn>).mock.results[0]!.value;
        expect(progressResult.start).toHaveBeenCalledWith("Processing...");
        expect(progressResult.stop).toHaveBeenCalledWith("All done");
      }).pipe(Effect.provide(ActivityLive)),
    );
  });

  describe("startTaskLog", () => {
    it.effect("creates a task log and wraps its handle", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startTaskLog({ title: "Build" });
        expect(clack.taskLog).toHaveBeenCalledWith({ title: "Build" });
        expect(handle.message).toBeTypeOf("function");
        expect(handle.group).toBeTypeOf("function");
        yield* handle.message("step 1");
        const taskLogResult = (clack.taskLog as ReturnType<typeof vi.fn>).mock.results[0]!.value;
        expect(taskLogResult.message).toHaveBeenCalledWith("step 1");
      }).pipe(Effect.provide(ActivityLive)),
    );
  });

  describe("withTaskLog", () => {
    it.effect("provides a handle to the callback", () =>
      Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.withTaskLog({ title: "Build" }, (handle) => handle.message("compiling"));
        expect(clack.taskLog).toHaveBeenCalledWith({ title: "Build" });
        const taskLogResult = (clack.taskLog as ReturnType<typeof vi.fn>).mock.results[0]!.value;
        expect(taskLogResult.message).toHaveBeenCalledWith("compiling");
      }).pipe(Effect.provide(ActivityLive)),
    );
  });

  describe("runTasks", () => {
    it.effect("runs tasks sequentially with spinners", () => {
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
        ]);
        expect(order).toEqual(["A", "B"]);
      }).pipe(Effect.provide(ActivityLive));
    });

    it.effect("skips disabled tasks", () => {
      const order: string[] = [];
      return Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.runTasks([
          {
            title: "Enabled",
            task: () =>
              Effect.sync(() => {
                order.push("enabled");
              }),
          },
          {
            title: "Disabled",
            enabled: false,
            task: () =>
              Effect.sync(() => {
                order.push("disabled");
              }),
          },
        ]);
        expect(order).toEqual(["enabled"]);
      }).pipe(Effect.provide(ActivityLive));
    });
  });
});
