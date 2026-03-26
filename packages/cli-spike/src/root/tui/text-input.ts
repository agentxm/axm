import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { withRuntime } from "../../runtime.js";

export const textInputCommand = Command.make("text-input", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const name = yield* prompt.text({
        message: "What is your name?",
        placeholder: "Enter your name...",
      });
      yield* renderer.success(`Hello, ${name}!`);
    }),
    { command: "tui text-input" },
  ),
).pipe(Command.withDescription("Demo text input prompt"));
