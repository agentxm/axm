import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const logLevels = ["message", "info", "success", "step", "warn", "error", "cancel"] as const;

const logConfig = {
  message: Argument.string("message").pipe(
    Argument.withDescription("Message to render"),
    Argument.optional,
  ),
  level: Flag.choice("level", logLevels).pipe(
    Flag.withDescription("Renderer method to use"),
    Flag.withDefault("info" as const),
  ),
} as const;

const handleLog = (args: {
  readonly message: Option.Option<string>;
  readonly level: (typeof logLevels)[number];
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = Option.getOrElse(args.message, () => "This is a demo log message");

    switch (args.level) {
      case "message":
        yield* renderer.message(message);
        return;
      case "info":
        yield* renderer.info(message);
        return;
      case "success":
        yield* renderer.success(message);
        return;
      case "step":
        yield* renderer.step(message);
        return;
      case "warn":
        yield* renderer.warn(message);
        return;
      case "error":
        yield* renderer.error(message);
        return;
      case "cancel":
        yield* renderer.cancel(message);
        return;
    }
  });

export const logCommand = Command.make("log", logConfig, ({ message, level }) =>
  handleLog({ message, level }).pipe(withRuntime({ command: "outputs log" })),
).pipe(
  withArgvTracking(logConfig),
  Command.withDescription("Render one log-level output method"),
  Command.withExamples([
    {
      command: 'axm-spike outputs log "Lint passed" --level success',
      description: "Render a success log line",
    },
    {
      command: 'axm-spike outputs log "Check your config" --level warn',
      description: "Render a warning log line",
    },
  ]),
);
