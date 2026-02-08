import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { Log, PasswordInput, TuiLive } from "../../../tui/index.js";

export const passwordInputCommand: CommandModule = {
  command: "password-input",
  describe: "Demo password input",
  handler: () => {
    const program = Effect.gen(function* () {
      const passwordInput = yield* PasswordInput;
      const log = yield* Log;
      const token = yield* passwordInput.prompt({ message: "Enter your token:" });
      yield* log.success(`Token received (${String(token.length)} chars)`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(TuiLive)));
  },
};
