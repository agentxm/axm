import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { withRuntime } from "../../runtime.js";

export const multiselectCommand = Command.make("multiselect", {}, () =>
  withRuntime(
    Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const choices = yield* prompt.multiselect({
        message: "Pick your favorite fruits:",
        options: ["Apple", "Banana", "Cherry", "Date", "Elderberry"].map((item) => ({
          value: item,
          label: item,
        })),
        required: true,
      });
      yield* renderer.success(`You picked: ${choices.join(", ")}`);
    }),
    { command: "tui multiselect" },
  ),
).pipe(Command.withDescription("Demo multiselect prompt"));
