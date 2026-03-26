import * as Effect from "effect/Effect";
import { CliRenderer, InteractiveRenderer } from "@axm.sh/core/unstable/cli-renderer";

export const logCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.info("This is an info message");
      yield* renderer.warn("This is a warning message");
      yield* renderer.error("This is an error message");
      yield* renderer.success("This is a success message");
      yield* renderer.message("This is a plain message");
    });
    return Effect.runPromise(program.pipe(Effect.provide(InteractiveRenderer())));
  },
};
