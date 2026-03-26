import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { withRuntime } from "../../runtime.js";

export const confirmCommand = Command.make("confirm", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const result = yield* prompt.confirm({ message: "Do you want to continue?" });
      yield* renderer.success(`You chose: ${result ? "Yes" : "No"}`);
    }),
    { command: "tui confirm" },
  ),
).pipe(Command.withDescription("Demo confirm prompt"));
