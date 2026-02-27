import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { ClackLive, ClackSpinner } from "../../../clack-effect/index.js";

export const spinnerCommand: CommandModule = {
  command: "spinner",
  describe: "Demo spinner animation",
  handler: () => {
    const program = Effect.gen(function* () {
      const spinner = yield* ClackSpinner;
      yield* spinner.withSpinner(
        "Loading something...",
        () => Effect.sleep("2 seconds"),
        "Done loading!",
      );
    });
    return Effect.runPromise(program.pipe(Effect.provide(ClackLive)));
  },
};
