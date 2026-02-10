import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { Log, TextInput, TuiLive } from "../../../tui/index.js";

export const textInputCommand: CommandModule = {
  command: "text-input",
  describe: "Demo text input",
  handler: () => {
    const program = Effect.gen(function* () {
      const textInput = yield* TextInput;
      const log = yield* Log;
      const name = yield* textInput.prompt({
        message: "What is your name?",
        placeholder: "Enter your name...",
      });
      yield* log.success(`Hello, ${name}!`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(TuiLive)));
  },
};
