import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { dual } from "effect/Function";
import { Prompt } from "effect/unstable/cli";
import type * as PromptTypes from "effect/unstable/cli/Prompt";
import type * as Terminal from "effect/Terminal";
import { makeAppError } from "../../app-error/index.js";
import * as TerminalService from "effect/Terminal";
import { isCI, nonInteractiveFlag } from "../../cli-flags/index.js";
import { PromptCancelled } from "../../cli-prompt/prompt-cancelled.js";

interface PromptGuardOptions {
  readonly message: string;
  readonly howToFix?: string;
}

const defaultHowToFix = "Pass the value via a flag or remove --non-interactive.";

const resolveNonInteractive = Effect.gen(function* () {
  const explicit = Option.flatten(yield* Effect.serviceOption(nonInteractiveFlag));
  const ci = yield* isCI;
  return Option.getOrElse(explicit, () => ci || process.stdin.isTTY !== true);
});

const resolvePromptEnvironment = Effect.gen(function* () {
  const fileSystem = yield* Effect.serviceOption(FileSystem.FileSystem);
  const path = yield* Effect.serviceOption(Path.Path);
  const terminal = yield* Effect.serviceOption(TerminalService.Terminal);

  if (Option.isNone(fileSystem) || Option.isNone(path) || Option.isNone(terminal)) {
    return Option.none<Layer.Layer<PromptTypes.Environment>>();
  }

  return Option.some(
    Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fileSystem.value),
      Layer.succeed(Path.Path, path.value),
      Layer.succeed(TerminalService.Terminal, terminal.value),
    ),
  );
});

export const unless: {
  <A>(
    value: Option.Option<A>,
  ): (self: PromptTypes.Prompt<A>) => Effect.Effect<A, Terminal.QuitError, PromptTypes.Environment>;
  <A>(
    self: PromptTypes.Prompt<A>,
    value: Option.Option<A>,
  ): Effect.Effect<A, Terminal.QuitError, PromptTypes.Environment>;
} = dual(2, <A>(self: PromptTypes.Prompt<A>, value: Option.Option<A>) =>
  Option.match(value, {
    onNone: () => self,
    onSome: (resolved) => Effect.succeed(resolved),
  }),
);

export const autoConfirm: {
  (
    yes: boolean,
  ): (
    self: PromptTypes.Prompt<boolean>,
  ) => Effect.Effect<boolean, Terminal.QuitError, PromptTypes.Environment>;
  (
    self: PromptTypes.Prompt<boolean>,
    yes: boolean,
  ): Effect.Effect<boolean, Terminal.QuitError, PromptTypes.Environment>;
} = dual(2, (self: PromptTypes.Prompt<boolean>, yes: boolean) =>
  yes ? Effect.succeed(true) : self,
);

export const promptRequired = (options: PromptGuardOptions) =>
  makeAppError({
    code: "PROMPT_REQUIRED",
    what: `Interactive prompt required: ${options.message}`,
    howToFix: options.howToFix ?? defaultHowToFix,
  });

export const runPrompt = <A>(prompt: PromptTypes.Prompt<A>) =>
  Prompt.run(prompt).pipe(
    Effect.catchTag("QuitError", () =>
      Effect.fail(new PromptCancelled({ message: "Operation cancelled." })),
    ),
  );

export const fromInteractivePrompt = <A>(
  prompt: PromptTypes.Prompt<A>,
  options: PromptGuardOptions,
) =>
  Effect.gen(function* () {
    const nonInteractive = yield* resolveNonInteractive;
    if (nonInteractive) {
      return yield* promptRequired(options);
    }

    const promptEnvironment = yield* resolvePromptEnvironment;
    if (Option.isNone(promptEnvironment)) {
      return yield* promptRequired({
        message: options.message,
        howToFix:
          options.howToFix ??
          "Provide Terminal, FileSystem, and Path services or run through the CLI runtime.",
      });
    }

    return yield* runPrompt(prompt).pipe(Effect.provide(promptEnvironment.value));
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
