import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { withRuntime } from "../../runtime.js";

export const selectCommand = Command.make("select", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const choice = yield* prompt.select({
        message: "Pick a color:",
        options: ["Red", "Green", "Blue"].map((item) => ({
          value: item,
          label: item,
        })),
      });
      yield* renderer.success(`You picked: ${choice}`);
    }),
    { command: "tui select" },
  ),
).pipe(Command.withDescription("Demo select prompt"));
