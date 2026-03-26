import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
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

export const streamLogCommand = Command.make("stream-log", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const logStream = Stream.fromIterable(buildLogLines).pipe(
        Stream.mapEffect((line) =>
          Effect.gen(function* () {
            yield* Effect.sleep("300 millis");
            return line;
          }),
        ),
      );
      yield* renderer.streamLog("info", logStream);
    }),
    { command: "outputs stream-log", isLongRunning: true },
  ),
).pipe(Command.withDescription("Demo streaming log output"));
