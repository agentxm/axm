import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliRenderer, InteractiveRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt, makeInteractivePrompt } from "@axm.sh/core/unstable/cli-prompt";

export const confirmCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const result = yield* prompt.confirm({ message: "Do you want to continue?" });
      yield* renderer.success(`You chose: ${result ? "Yes" : "No"}`);
    });
    return Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.mergeAll(InteractiveRenderer(), makeInteractivePrompt(false))),
      ),
    );
  },
};
