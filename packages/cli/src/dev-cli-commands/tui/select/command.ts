import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log, Select, TuiLive } from "../../../tui/index.js";

export const selectCommand: CommandModule = {
  command: "select",
  describe: "Demo select prompt",
  handler: () => {
    const program = Effect.gen(function* () {
      const select = yield* Select;
      const log = yield* Log;
      const choice = yield* select.prompt({
        message: "Pick a color:",
        items: ["Red", "Green", "Blue"],
        toOption: (item) => ({ label: item, hint: Option.none() }),
      });
      yield* log.success(`You picked: ${choice}`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(TuiLive)));
  },
};
