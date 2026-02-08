import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log, Multiselect, TuiLive } from "../../../tui/index.js";

export const multiselectCommand: CommandModule = {
  command: "multiselect",
  describe: "Demo multiselect prompt",
  handler: () => {
    const program = Effect.gen(function* () {
      const multiselect = yield* Multiselect;
      const log = yield* Log;
      const choices = yield* multiselect.prompt({
        message: "Pick your favorite fruits:",
        items: ["Apple", "Banana", "Cherry", "Date", "Elderberry"],
        toOption: (item) => ({ label: item, value: item, hint: Option.none() }),
        initialValues: Option.none(),
        required: Option.some(true),
      });
      yield* log.success(`You picked: ${choices.join(", ")}`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(TuiLive)));
  },
};
