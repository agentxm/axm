import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Prompt } from "effect/unstable/cli";
import type * as PromptTypes from "effect/unstable/cli/Prompt";

import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { isNonInteractive } from "@axm.sh/core/unstable/cli-flags";

interface PromptGuardOptions {
  readonly message: string;
  readonly howToFix?: string;
}

const defaultHowToFix = "Pass the value via a flag or remove --non-interactive.";

export const promptRequired = (options: PromptGuardOptions) =>
  makeAppError({
    code: "PROMPT_REQUIRED",
    what: `Interactive prompt required: ${options.message}`,
    howToFix: options.howToFix ?? defaultHowToFix,
  });

export const fromInteractivePrompt = <A>(
  prompt: PromptTypes.Prompt<A>,
  options: PromptGuardOptions,
) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractive;
    if (nonInteractive) {
      return yield* promptRequired(options);
    }

    return yield* prompt;
  });

export const fromFlagOrInteractivePrompt = <A>(
  value: Option.Option<A>,
  prompt: PromptTypes.Prompt<A>,
  options: PromptGuardOptions,
) =>
  Option.match(value, {
    onNone: () => fromInteractivePrompt(prompt, options),
    onSome: (resolved) => Effect.succeed(resolved),
  });

export const fromValuesOrInteractivePrompt = <A>(
  values: ReadonlyArray<A>,
  prompt: PromptTypes.Prompt<ReadonlyArray<A>>,
  options: PromptGuardOptions,
) => (values.length > 0 ? Effect.succeed(values) : fromInteractivePrompt(prompt, options));

export const promptOrValue = <A>(
  value: Option.Option<A>,
  prompt: PromptTypes.Prompt<A>,
): PromptTypes.Prompt<A> =>
  Option.match(value, {
    onNone: () => prompt,
    onSome: (resolved) => Prompt.succeed(resolved),
  });
