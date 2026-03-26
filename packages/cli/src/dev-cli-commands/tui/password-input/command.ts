import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliRenderer, InteractiveRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt, makeInteractivePrompt } from "@axm.sh/core/unstable/cli-prompt";

export const passwordInputCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* CliPrompt;
      const renderer = yield* CliRenderer;
      const token = yield* prompt.password({ message: "Enter your token:" });
      yield* renderer.success(`Token received (${String(token.length)} chars)`);
    });
    return Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.mergeAll(InteractiveRenderer(), makeInteractivePrompt(false))),
      ),
    );
  },
};
