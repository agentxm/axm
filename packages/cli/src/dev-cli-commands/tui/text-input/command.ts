import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliRenderer, InteractiveRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt, makeInteractivePrompt } from "@axm.sh/core/unstable/cli-prompt";

export const textInputCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const name = yield* prompt.text({
        message: "What is your name?",
        placeholder: "Enter your name...",
      });
      yield* renderer.success(`Hello, ${name}!`);
    });
    return Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.mergeAll(InteractiveRenderer(), makeInteractivePrompt(false))),
      ),
    );
  },
};
