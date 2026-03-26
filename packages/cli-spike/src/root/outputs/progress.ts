import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { type ProgressConfig, CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const progressConfig = {
  style: Flag.choice("style", ["light", "heavy", "block"] as const).pipe(
    Flag.withDescription("Progress bar style"),
    Flag.optional,
  ),
  max: Flag.integer("max").pipe(Flag.withDescription("Maximum progress value"), Flag.optional),
  size: Flag.integer("size").pipe(
    Flag.withDescription("Progress bar size in columns"),
    Flag.optional,
  ),
} as const;

export const progressCommand = Command.make("progress", progressConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const max = Option.getOrElse(config.max, () => 10);
      const cfg: ProgressConfig = {
        ...(Option.isSome(config.style) && { style: config.style.value }),
        max,
        ...(Option.isSome(config.size) && { size: config.size.value }),
      };
      yield* renderer.withProgress(cfg, "Processing items...", (handle) =>
        Effect.forEach(
          Array.from({ length: max }, (_, i) => i),
          (i) =>
            Effect.gen(function* () {
              yield* Effect.sleep("300 millis");
              yield* handle.advance(1, `Processing item ${i + 1}/${max}`);
            }),
          { concurrency: 1 },
        ),
      );
    }),
    { command: "outputs progress", isLongRunning: true },
  ),
).pipe(Command.withDescription("Demo progress bar"));
