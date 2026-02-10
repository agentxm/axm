import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { Confirm, Log, TuiLive } from "../../../tui/index.js";

export const confirmCommand: CommandModule = {
  command: "confirm",
  describe: "Demo confirm prompt",
  handler: () => {
    const program = Effect.gen(function* () {
      const confirm = yield* Confirm;
      const log = yield* Log;
      const result = yield* confirm.prompt({ message: "Do you want to continue?" });
      yield* log.success(`You chose: ${result ? "Yes" : "No"}`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(TuiLive)));
  },
};
