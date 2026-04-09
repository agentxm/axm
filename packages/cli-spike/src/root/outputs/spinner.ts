import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { type SpinnerOptions, CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const spinnerConfig = {
  message: Argument.string("message").pipe(
    Argument.withDescription("Spinner message"),
    Argument.optional,
  ),
  successMessage: Flag.string("success-message").pipe(
    Flag.withDescription("Message shown on success"),
    Flag.optional,
  ),
  failureMessage: Flag.string("failure-message").pipe(
    Flag.withDescription("Message shown on failure"),
    Flag.optional,
  ),
} as const;

const handleSpinner = (args: {
  readonly message: Option.Option<string>;
  readonly successMessage: Option.Option<string>;
  readonly failureMessage: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const options: SpinnerOptions<void> = {
      successMessage: Option.getOrElse(args.successMessage, () => "Done loading!"),
      ...(Option.isSome(args.failureMessage) && {
        failureMessage: args.failureMessage.value,
      }),
    };

    yield* renderer.withSpinner(
      Option.getOrElse(args.message, () => "Loading something..."),
      () => Effect.sleep("2 seconds"),
      options,
    );
  });

export const spinnerCommand = Command.make(
  "spinner",
  spinnerConfig,
  ({ message, successMessage, failureMessage }) =>
    handleSpinner({ message, successMessage, failureMessage }).pipe(withRuntime("outputs spinner")),
).pipe(
  withArgvTracking(spinnerConfig),
  Command.withDescription("Render spinner progress"),
  Command.withExamples([
    {
      command: 'axm-spike outputs spinner "Downloading registry index"',
      description: "Render a spinner with a custom message",
    },
  ]),
);
