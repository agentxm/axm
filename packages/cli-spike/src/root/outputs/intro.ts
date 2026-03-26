import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

export const introCommand = Command.make("intro", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.intro("Welcome to axm-spike");
      yield* renderer.message("Doing some work in between...");
      yield* renderer.outro("All done. Goodbye!");
    }),
    { command: "outputs intro" },
  ),
).pipe(Command.withDescription("Demo intro and outro framing"));
