import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Prompt } from "effect/unstable/cli";
import type * as PromptTypes from "effect/unstable/cli/Prompt";
import { makeAppError } from "../../app-error/index.js";
import { isCI, nonInteractiveFlag } from "../../cli-flags/index.js";
import { PromptCancelled } from "../../cli-prompt/prompt-cancelled.js";

interface InteractiveGuardOptions {
  readonly message: string;
  readonly guidance?: string;
}

const defaultHowToFix = "Pass the value via a flag or remove --non-interactive.";

const resolveNonInteractive = Effect.gen(function* () {
  const explicit = Option.flatten(yield* Effect.serviceOption(nonInteractiveFlag));
  const ci = yield* isCI;
  return Option.getOrElse(explicit, () => ci || process.stdin.isTTY !== true);
});

const promptRequired = (options: InteractiveGuardOptions) =>
  makeAppError({
    code: "usage",
    message: `Interactive prompt required: ${options.message}`,
    breadcrumbs: [{ task: "Recover", description: options.guidance ?? defaultHowToFix }],
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
    const nonInteractive = yield* resolveNonInteractive;
    if (nonInteractive) {
      return yield* promptRequired(options);
    }

    return yield* runPrompt(prompt);
  });
