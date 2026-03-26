import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { type SpinnerOptions, CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const spinnerConfig = {
  successMessage: Flag.string("success-message").pipe(
    Flag.withDescription("Message shown on success"),
    Flag.optional,
  ),
  failureMessage: Flag.string("failure-message").pipe(
    Flag.withDescription("Message shown on failure"),
    Flag.optional,
  ),
} as const;

export const spinnerCommand = Command.make("spinner", spinnerConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const opts: SpinnerOptions<void> = {
        successMessage: Option.getOrElse(config.successMessage, () => "Done loading!"),
        ...(Option.isSome(config.failureMessage) && {
          failureMessage: config.failureMessage.value,
        }),
      };
      yield* renderer.withSpinner("Loading something...", () => Effect.sleep("2 seconds"), opts);
    }),
    { command: "outputs spinner", isLongRunning: true },
  ),
).pipe(Command.withDescription("Demo spinner animation"));
