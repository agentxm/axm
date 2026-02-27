import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { ClackLive, ClackLog, ClackPrompt } from "../../../clack-effect/index.js";

export const confirmCommand: CommandModule = {
  command: "confirm",
  describe: "Demo confirm prompt",
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      const log = yield* ClackLog;
      const result = yield* prompt.confirm({ message: "Do you want to continue?" });
      yield* log.success(`You chose: ${result ? "Yes" : "No"}`);
    });
    return Effect.runPromise(program.pipe(Effect.provide(ClackLive)));
  },
};
