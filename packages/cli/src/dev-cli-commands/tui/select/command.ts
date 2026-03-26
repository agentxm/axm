import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliRenderer, InteractiveRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt, makeInteractivePrompt } from "@axm.sh/core/unstable/cli-prompt";

export const selectCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const choice = yield* prompt.select({
        message: "Pick a color:",
        options: ["Red", "Green", "Blue"].map((item) => ({
          value: item,
          label: item,
        })),
      });
      yield* renderer.success(`You picked: ${choice}`);
    });
    return Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.mergeAll(InteractiveRenderer(), makeInteractivePrompt(false))),
      ),
    );
  },
};
