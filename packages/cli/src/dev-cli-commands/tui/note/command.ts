import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { ClackLive, ClackLog } from "../../../clack-effect/index.js";

export const noteCommand: CommandModule = {
  command: "note",
  describe: "Demo boxed note",
  handler: () => {
    const program = Effect.gen(function* () {
      const log = yield* ClackLog;
      yield* log.note("This is a note with a title.", "Welcome");
      yield* log.note("This is a note without a title.");
    });
    return Effect.runPromise(program.pipe(Effect.provide(ClackLive)));
  },
};
