import * as Effect from "effect/Effect";
import { CliRenderer, InteractiveRenderer } from "@axm.sh/core/unstable/cli-renderer";

export const noteCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.note("This is a note with a title.", "Welcome");
      yield* renderer.note("This is a note without a title.");
    });
    return Effect.runPromise(program.pipe(Effect.provide(InteractiveRenderer())));
  },
};
