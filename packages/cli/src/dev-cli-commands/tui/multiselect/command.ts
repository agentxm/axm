import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackLive, ClackLog, ClackPrompt } from "../../../clack-effect/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";

export const multiselectCommand: CommandModule = {
  command: "multiselect",
  describe: "Demo multiselect prompt",
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      const log = yield* ClackLog;
      const choices = yield* prompt.multiselect({
        message: "Pick your favorite fruits:",
        options: ["Apple", "Banana", "Cherry", "Date", "Elderberry"].map((item) => ({
          value: item,
          label: item,
        })),
        required: true,
      });
      yield* log.success(`You picked: ${choices.join(", ")}`);
    });
    return Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.provide(ClackLive, CliFlagsTest({ nonInteractive: false }))),
      ),
    );
  },
};
