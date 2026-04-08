import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const runTasksConfig = {} as const;

const handleRunTasks = Effect.gen(function* () {
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
});

export const runTasksCommand = Command.make("run-tasks", runTasksConfig, () =>
  handleRunTasks.pipe(withRuntime({ command: "outputs run-tasks" })),
).pipe(
  withArgvTracking(runTasksConfig),
  Command.withDescription("Run multiple demo tasks"),
  Command.withExamples([
    {
      command: "axm-spike outputs run-tasks",
      description: "Render a multi-task progress view",
    },
  ]),
);
