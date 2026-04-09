import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const buildLogLines = [
  "[1/5] Resolving packages...",
  "[2/5] Fetching packages...",
  "[3/5] Linking dependencies...",
  "[4/5] Building fresh packages...",
  "  > @axm.sh/core: tsc --build",
  "  > @axm.sh/cli: tsc --build",
  "  > @axm.sh/cli-spike: tsc --build",
  "[5/5] Done in 3.42s",
];

const streamLogConfig = {
  level: Flag.choice("level", [
    "message",
    "info",
    "success",
    "step",
    "warn",
    "error",
  ] as const).pipe(
    Flag.withDescription("Log level for the streamed lines"),
    Flag.withDefault("info" as const),
  ),
} as const;

const handleStreamLog = (args: {
  readonly level: "message" | "info" | "success" | "step" | "warn" | "error";
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const logStream = Stream.fromIterable(buildLogLines).pipe(
      Stream.mapEffect((line) =>
        Effect.gen(function* () {
          yield* Effect.sleep("300 millis");
          return line;
        }),
      ),
      Stream.intersperse("\n"),
    );

    yield* renderer.streamLog(args.level, logStream);
  });

export const streamLogCommand = Command.make("stream-log", streamLogConfig, ({ level }) =>
  handleStreamLog({ level }).pipe(withRuntime("outputs stream-log")),
).pipe(
  withArgvTracking(streamLogConfig),
  Command.withDescription("Render streamed log output"),
  Command.withExamples([
    {
      command: "axm-spike outputs stream-log --level warn",
      description: "Stream log lines through a warning channel",
    },
  ]),
);
