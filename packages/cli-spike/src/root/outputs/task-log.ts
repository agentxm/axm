import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { type TaskLogConfig, CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { withRuntime } from "../../runtime.js";

const commandMeta = spikeCommandMeta("outputs task-log", { json: true });

const taskLogConfig = {
  title: Argument.string("title").pipe(
    Argument.withDescription("Task log title"),
    Argument.optional,
  ),
  limit: Flag.integer("limit").pipe(
    Flag.withDescription("Maximum visible log lines"),
    Flag.optional,
  ),
  retainLog: Flag.boolean("retain-log").pipe(
    Flag.withDescription("Keep log output after completion"),
  ),
} as const;

const handleTaskLog = (args: {
  readonly title: Option.Option<string>;
  readonly limit: Option.Option<number>;
  readonly retainLog: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const config: TaskLogConfig = {
      title: Option.getOrElse(args.title, () => "Building project"),
      ...(Option.isSome(args.limit) && { limit: args.limit.value }),
      retainLog: args.retainLog,
    };

    yield* renderer.withTaskLog(config, (handle) =>
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
  });

export const taskLogCommand = Command.make(
  "task-log",
  taskLogConfig,
  ({ title, limit, retainLog }) =>
    handleTaskLog({ title, limit, retainLog }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(taskLogConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Render a task log"),
  Command.withExamples([
    {
      command: 'axm-spike outputs task-log "Publishing docs" --limit 3',
      description: "Render a bounded task log",
    },
  ]),
);
