import * as Effect from "effect/Effect";
import { Output, OutputLive } from "../../../output/index.js";

export const noteCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const output = yield* Output;
      yield* output.note("This is a note with a title.", "Welcome");
      yield* output.note("This is a note without a title.");
    });
    return Effect.runPromise(program.pipe(Effect.provide(OutputLive("text"))));
  },
};
