import * as Effect from "effect/Effect";
import { Output, OutputLive } from "../../../output/index.js";

export const logCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const output = yield* Output;
      yield* output.info("This is an info message");
      yield* output.warn("This is a warning message");
      yield* output.error("This is an error message");
      yield* output.success("This is a success message");
      yield* output.message("This is a plain message");
    });
    return Effect.runPromise(program.pipe(Effect.provide(OutputLive("text"))));
  },
};
