import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

export const spinnerCommand = Command.make("spinner", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.withSpinner("Loading something...", () => Effect.sleep("2 seconds"), {
        successMessage: "Done loading!",
      });
    }),
    { command: "tui spinner", isLongRunning: true },
  ),
).pipe(Command.withDescription("Demo spinner animation"));
