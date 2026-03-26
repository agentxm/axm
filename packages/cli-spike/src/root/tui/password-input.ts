import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { withRuntime } from "../../runtime.js";

export const passwordInputCommand = Command.make("password-input", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const token = yield* prompt.password({ message: "Enter your token:" });
      yield* renderer.success(`Token received (${String(token.length)} chars)`);
    }),
    { command: "tui password-input" },
  ),
).pipe(Command.withDescription("Demo password input prompt"));
