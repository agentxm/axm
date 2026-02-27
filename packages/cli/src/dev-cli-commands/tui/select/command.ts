import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { ClackLive, ClackLog, ClackPrompt } from "../../../clack-effect/index.js";

export const selectCommand: CommandModule = {
  command: "select",
  describe: "Demo select prompt",
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      const log = yield* ClackLog;
      const choice = yield* prompt.select({
        message: "Pick a color:",
        options: ["Red", "Green", "Blue"].map((item) => ({
          value: item,
          label: item,
        })),
      });
      yield* log.success(`You picked: ${choice}`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(ClackLive)));
  },
};
