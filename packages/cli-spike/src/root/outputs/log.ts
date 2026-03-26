import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

export const logCommand = Command.make("log", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.message("This is a plain message");
      yield* renderer.info("This is an info message");
      yield* renderer.success("This is a success message");
      yield* renderer.step("This is a step message");
      yield* renderer.warn("This is a warning message");
      yield* renderer.error("This is an error message");
      yield* renderer.cancel("This is a cancel message");
    }),
    { command: "outputs log" },
  ),
).pipe(Command.withDescription("Demo all log-level output methods"));
