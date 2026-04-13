import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { type ProgressConfig, CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const progressConfig = {
  message: Argument.string("message").pipe(
    Argument.withDescription("Progress message"),
    Argument.optional,
  ),
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

const handleProgress = (args: {
  readonly message: Option.Option<string>;
  readonly style: Option.Option<"light" | "heavy" | "block">;
  readonly max: Option.Option<number>;
  readonly size: Option.Option<number>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const max = Option.getOrElse(args.max, () => 10);
    const config: ProgressConfig = {
      ...(Option.isSome(args.style) && { style: args.style.value }),
      max,
      ...(Option.isSome(args.size) && { size: args.size.value }),
    };

    yield* renderer.withProgress(
      config,
      Option.getOrElse(args.message, () => "Processing items..."),
      (handle) =>
        Effect.forEach(
          Array.from({ length: max }, (_, index) => index),
          (index) =>
            Effect.gen(function* () {
              yield* Effect.sleep("300 millis");
              yield* handle.advance(1, `Processing item ${index + 1}/${max}`);
            }),
          { concurrency: 1 },
        ),
    );
  });

export const progressCommand = Command.make(
  "progress",
  progressConfig,
  ({ message, style, max, size }) =>
    handleProgress({ message, style, max, size }).pipe(withRuntime("outputs progress")),
).pipe(
  withArgvTracking(progressConfig),
  Command.withDescription("Render progress output"),
  Command.withExamples([
    {
      command: 'axm-spike outputs progress "Publishing packages" --max 5',
      description: "Render a five-step progress bar",
    },
  ]),
);
