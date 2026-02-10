import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import { Note, TuiLive } from "../../../tui/index.js";

export const noteCommand: CommandModule = {
  command: "note",
  describe: "Demo boxed note",
  handler: () => {
    const program = Effect.gen(function* () {
      const note = yield* Note;
      yield* note.display("This is a note with a title.", "Welcome");
      yield* note.display("This is a note without a title.");
    });
    return Effect.runPromise(program.pipe(Effect.provide(TuiLive)));
  },
};
