import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { ClackLive, ClackLog, ClackPrompt } from "../../../clack-effect/index.js";

export const passwordInputCommand: CommandModule = {
  command: "password-input",
  describe: "Demo password input",
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      const log = yield* ClackLog;
      const token = yield* prompt.password({ message: "Enter your token:" });
      yield* log.success(`Token received (${String(token.length)} chars)`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(ClackLive)));
  },
};
