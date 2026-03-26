import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

export const noteCommand = Command.make("note", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.note("This is a note with a title.", "Welcome");
      yield* renderer.note("This is a note without a title.");
    }),
    { command: "tui note" },
  ),
).pipe(Command.withDescription("Demo boxed note"));
