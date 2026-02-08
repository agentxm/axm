import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { Spinner, TuiLive } from "../../../tui/index.js";

export const spinnerCommand: CommandModule = {
  command: "spinner",
  describe: "Demo spinner animation",
  handler: () => {
    const program = Effect.gen(function* () {
      const spinner = yield* Spinner;
      const handle = yield* spinner.start("Loading something...");
      yield* Effect.sleep("2 seconds");
      yield* handle.stop("Done loading!");
    });
    return Effect.runPromise(program.pipe(Effect.provide(TuiLive)));
  },
};
