import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Activity } from "./activity.js";
import { ActivityAdapter } from "./activity-adapter.js";
import { TestRenderer, type TestRendererState } from "../cli-renderer/cli-renderer-test.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const setup = (): { readonly layer: Layer.Layer<Activity>; readonly state: TestRendererState } => {
  const { layer: rendererLayer, state } = TestRenderer.make();
  const layer = Layer.provide(ActivityAdapter, rendererLayer);
  return { layer, state };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ActivityAdapter", () => {
  describe("startSpinner", () => {
    it.effect("delegates to CliRenderer.spinner", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        expect(state.spinnerMessages).toContain("Loading...");
        yield* handle.stop("Done");
        expect(state.spinnerMessages).toContain("Done");
      }).pipe(Effect.provide(layer));
    });

    it.effect("maps SpinnerHandle.message to SpinnerHandle.update", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startSpinner("Loading...");
        yield* handle.message("Still loading...");
        expect(state.spinnerMessages).toContain("Still loading...");
      }).pipe(Effect.provide(layer));
    });

    it.effect("startSpinner with undefined message passes empty string", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.startSpinner();
        expect(state.spinnerMessages).toContain("");
      }).pipe(Effect.provide(layer));
    });
  });

  describe("withSpinner", () => {
    it.effect("delegates to CliRenderer.withSpinner", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withSpinner("Working...", () => Effect.succeed("done"));
        expect(result).toBe("done");
        expect(state.spinnerMessages).toContain("Working...");
      }).pipe(Effect.provide(layer));
    });

    it.effect("withSpinner passes SpinnerOptions through", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withSpinner(
          "Working...",
          () => Effect.succeed("done"),
          { successMessage: "All good!" },
        );
        expect(result).toBe("done");
        expect(state.spinnerMessages).toContain("All good!");
      }).pipe(Effect.provide(layer));
    });

    it.effect("withSpinner converts string option to SpinnerOptions", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withSpinner(
          "Working...",
          () => Effect.succeed("done"),
          "Completed!",
        );
        expect(result).toBe("done");
        expect(state.spinnerMessages).toContain("Completed!");
      }).pipe(Effect.provide(layer));
    });

    it.effect("withSpinner provides adapted handle with message method", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.withSpinner("Working...", (handle) =>
          Effect.gen(function* () {
            yield* handle.message("progress update");
            return "done";
          }),
        );
        expect(state.spinnerMessages).toContain("progress update");
      }).pipe(Effect.provide(layer));
    });
  });

  describe("startProgress", () => {
    it.effect("delegates to CliRenderer.progress", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startProgress({ max: 100 }, "Downloading...");
        expect(state.spinnerMessages).toContain("Downloading...");
        yield* handle.stop("Downloaded");
        expect(state.spinnerMessages).toContain("Downloaded");
      }).pipe(Effect.provide(layer));
    });

    it.effect("progress handle.message maps to update", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startProgress({ max: 100 }, "Downloading...");
        yield* handle.message("50% done");
        expect(state.spinnerMessages).toContain("50% done");
      }).pipe(Effect.provide(layer));
    });
  });

  describe("withProgress", () => {
    it.effect("delegates to CliRenderer.withProgress", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withProgress(
          { max: 10 },
          "Downloading...",
          () => Effect.succeed("done"),
          "Downloaded!",
        );
        expect(result).toBe("done");
        expect(state.spinnerMessages).toContain("Downloading...");
        expect(state.spinnerMessages).toContain("Downloaded!");
      }).pipe(Effect.provide(layer));
    });
  });

  describe("taskLog", () => {
    it.effect("startTaskLog delegates to CliRenderer.taskLog", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const handle = yield* activity.startTaskLog({ title: "Installing" });
        expect(state.spinnerMessages).toContain("Installing");
        yield* handle.message("step 1");
        expect(state.logs).toContainEqual({ _tag: "info", message: "[Installing] step 1" });
      }).pipe(Effect.provide(layer));
    });

    it.effect("withTaskLog delegates to CliRenderer.withTaskLog", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        const result = yield* activity.withTaskLog({ title: "Building" }, (handle) =>
          Effect.gen(function* () {
            yield* handle.message("compiling");
            return "built";
          }),
        );
        expect(result).toBe("built");
        expect(state.spinnerMessages).toContain("Building");
        expect(state.logs).toContainEqual({ _tag: "info", message: "[Building] compiling" });
      }).pipe(Effect.provide(layer));
    });
  });

  describe("runTasks", () => {
    it.effect("delegates to CliRenderer.runTasks", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.runTasks([
          { title: "Task A", task: () => Effect.succeed("a done") },
          { title: "Task B", task: () => Effect.succeed("b done") },
        ]);
        expect(state.spinnerMessages).toContain("Task A");
        expect(state.spinnerMessages).toContain("Task B");
      }).pipe(Effect.provide(layer));
    });

    it.effect("skips disabled tasks", () => {
      const { layer, state } = setup();
      return Effect.gen(function* () {
        const activity = yield* Activity;
        yield* activity.runTasks([
          { title: "Enabled", task: () => Effect.succeed("ok") },
          { title: "Disabled", task: () => Effect.succeed("ok"), enabled: false },
        ]);
        expect(state.spinnerMessages).toContain("Enabled");
        expect(state.spinnerMessages).not.toContain("Disabled");
      }).pipe(Effect.provide(layer));
    });
  });
});
