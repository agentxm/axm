import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

export const runTasksCommand = Command.make("run-tasks", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.runTasks([
        {
          title: "Checking dependencies",
          task: (message) =>
            Effect.gen(function* () {
              yield* message("Resolving packages...");
              yield* Effect.sleep("800 millis");
              return "All dependencies resolved";
            }),
        },
        {
          title: "Running linter",
          task: (message) =>
            Effect.gen(function* () {
              yield* message("Scanning files...");
              yield* Effect.sleep("600 millis");
              yield* message("Checking rules...");
              yield* Effect.sleep("400 millis");
              return "No issues found";
            }),
        },
        {
          title: "Running tests",
          task: (message) =>
            Effect.gen(function* () {
              yield* message("Collecting test suites...");
              yield* Effect.sleep("500 millis");
              yield* message("Running 42 tests...");
              yield* Effect.sleep("1 second");
              return "42 tests passed";
            }),
        },
        {
          title: "Building artifacts",
          task: (message) =>
            Effect.gen(function* () {
              yield* message("Compiling...");
              yield* Effect.sleep("700 millis");
              return "Build complete";
            }),
        },
      ]);
    }),
    { command: "outputs run-tasks", isLongRunning: true },
  ),
).pipe(Command.withDescription("Demo multi-task runner"));
