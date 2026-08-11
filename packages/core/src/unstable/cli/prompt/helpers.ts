import * as Effect from "effect/Effect";
import { Prompt } from "effect/unstable/cli";
import type * as PromptTypes from "effect/unstable/cli/Prompt";
import { makeAppError } from "../../app-error/index.js";
import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import type { SuggestedAction } from "../../cli-runtime/suggested-action.js";
import { PromptCancelled } from "../../cli-prompt/prompt-cancelled.js";

interface InteractiveGuardOptions {
  readonly message: string;
  readonly guidance?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

const defaultHowToFix = "Pass the value via a flag or remove --non-interactive.";

const promptRequired = (options: InteractiveGuardOptions) =>
  makeAppError({
    code: "usage",
    detail: `Interactive prompt required: ${options.message}`,
    suggestions: options.suggestions ?? [{ description: options.guidance ?? defaultHowToFix }],
  });

const runPrompt = <A>(prompt: PromptTypes.Prompt<A>) =>
  Prompt.run(prompt).pipe(
    Effect.catchTag("QuitError", () =>
      Effect.fail(new PromptCancelled({ message: "Operation cancelled." })),
    ),
  );

export const requireInteractive = <A>(
  prompt: PromptTypes.Prompt<A>,
  options: InteractiveGuardOptions,
) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractiveOptional;
    if (nonInteractive) {
      return yield* promptRequired(options);
    }

    return yield* runPrompt(prompt);
  });
