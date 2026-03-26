import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { type TaskLogConfig, CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const taskLogConfig = {
  limit: Flag.integer("limit").pipe(
    Flag.withDescription("Maximum visible log lines"),
    Flag.optional,
  ),
  retainLog: Flag.boolean("retain-log").pipe(
    Flag.withDescription("Keep log output after completion"),
  ),
} as const;

export const taskLogCommand = Command.make("task-log", taskLogConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const cfg: TaskLogConfig = {
        title: "Building project",
        ...(Option.isSome(config.limit) && { limit: config.limit.value }),
        retainLog: config.retainLog,
      };
      yield* renderer.withTaskLog(cfg, (handle) =>
        Effect.gen(function* () {
          yield* handle.message("Compiling TypeScript...");
          yield* Effect.sleep("500 millis");
          yield* handle.message("Bundling modules...");
          yield* Effect.sleep("500 millis");
          yield* handle.message("Generating types...");
          yield* Effect.sleep("500 millis");
          yield* handle.message("Writing output...");
          yield* Effect.sleep("500 millis");
          yield* handle.success("Build complete");
        }),
      );
    }),
    { command: "outputs task-log", isLongRunning: true },
  ),
).pipe(Command.withDescription("Demo task log output"));
