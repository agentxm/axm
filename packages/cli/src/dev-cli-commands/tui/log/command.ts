import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { Log, TuiLive } from "../../../tui/index.js";

export const logCommand: CommandModule = {
  command: "log",
  describe: "Demo log output variants",
  handler: () => {
    const program = Effect.gen(function* () {
      const log = yield* Log;
      yield* log.info("This is an info message");
      yield* log.warn("This is a warning message");
      yield* log.error("This is an error message");
      yield* log.success("This is a success message");
      yield* log.message("This is a plain message");
    });
    return Effect.runPromise(program.pipe(Effect.provide(TuiLive)));
  },
};
