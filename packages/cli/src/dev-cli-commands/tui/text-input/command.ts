import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { ClackLive, ClackLog, ClackPrompt } from "../../../clack-effect/index.js";

export const textInputCommand: CommandModule = {
  command: "text-input",
  describe: "Demo text input",
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      const log = yield* ClackLog;
      const name = yield* prompt.text({
        message: "What is your name?",
        placeholder: "Enter your name...",
      });
      yield* log.success(`Hello, ${name}!`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(ClackLive)));
  },
};
