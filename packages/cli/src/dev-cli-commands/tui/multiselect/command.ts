import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliRenderer, InteractiveRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt, makeInteractivePrompt } from "@axm.sh/core/unstable/cli-prompt";

export const multiselectCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const choices = yield* prompt.multiselect({
        message: "Pick your favorite fruits:",
        options: ["Apple", "Banana", "Cherry", "Date", "Elderberry"].map((item) => ({
          value: item,
          label: item,
        })),
        required: true,
      });
      yield* renderer.success(`You picked: ${choices.join(", ")}`);
    });
    return Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.mergeAll(InteractiveRenderer(), makeInteractivePrompt(false))),
      ),
    );
  },
};
