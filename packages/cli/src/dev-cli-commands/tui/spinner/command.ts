import * as Effect from "effect/Effect";
import { CliRenderer, InteractiveRenderer } from "@axm.sh/core/unstable/cli-renderer";

export const spinnerCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.withSpinner("Loading something...", () => Effect.sleep("2 seconds"), {
        successMessage: "Done loading!",
      });
    });
    return Effect.runPromise(program.pipe(Effect.provide(InteractiveRenderer())));
  },
};
