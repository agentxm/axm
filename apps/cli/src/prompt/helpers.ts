import * as Effect from "effect/Effect";
import { Prompt } from "effect/unstable/cli";
import type * as PromptTypes from "effect/unstable/cli/Prompt";
import { promptAvailability } from "../cli-flags/index.js";
import { PromptCancelled, promptRequired, type InteractiveGuard } from "../screen/index.js";

const runPrompt = <A>(prompt: PromptTypes.Prompt<A>) =>
  Prompt.run(prompt).pipe(
    Effect.catchTag("QuitError", () =>
      Effect.fail(new PromptCancelled({ message: "Operation cancelled." })),
    ),
  );

/**
 * The guard an Effect widget still passes through, until every kind has moved
 * into `Screen.ask` and this module goes with them.
 */
export const requireInteractive = <A>(prompt: PromptTypes.Prompt<A>, options: InteractiveGuard) =>
  Effect.gen(function* () {
    if (!(yield* promptAvailability)) {
      return yield* promptRequired(options);
    }

    return yield* runPrompt(prompt);
  });
