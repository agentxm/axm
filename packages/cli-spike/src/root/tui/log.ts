import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

export const logCommand = Command.make("log", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.info("This is an info message");
      yield* renderer.warn("This is a warning message");
      yield* renderer.error("This is an error message");
      yield* renderer.success("This is a success message");
      yield* renderer.message("This is a plain message");
    }),
    { command: "tui log" },
  ),
).pipe(Command.withDescription("Demo log output variants"));
