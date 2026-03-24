import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliFlags } from "../cli-flags/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import { PromptCancelled } from "../prompt-cancelled.js";
import { Input } from "./input.js";

// Assertion needed: our readonly config types are structurally compatible with Clack's
// mutable types, but exactOptionalPropertyTypes prevents direct assignment.
const asClack = <T>(config: unknown): T => config as T;

const wrapPrompt = <T>(thunk: () => Promise<T | symbol>) =>
  Effect.tryPromise({
    try: () => thunk(),
    catch: (error) =>
      makeAppError({
        code: "PROMPT_RENDER_FAILED",
        what: "Prompt failed to render",
        cause: error,
      }),
  }).pipe(
    Effect.flatMap((result) =>
      p.isCancel(result)
        ? Effect.fail(new PromptCancelled({ message: "Operation cancelled." }))
        : Effect.succeed(result as T),
    ),
  );

const guardedPrompt = <T>(
  nonInteractive: boolean,
  thunk: () => Promise<T | symbol>,
): Effect.Effect<T, AppError | PromptCancelled> =>
  nonInteractive
    ? Effect.fail(
        makeAppError({
          code: "PROMPT_IN_NON_INTERACTIVE",
          what: "Interactive prompt reached in non-interactive mode",
          howToFix:
            "This is a bug — the handler should bypass this prompt when --non-interactive is set",
        }),
      )
    : wrapPrompt(thunk);

export const InputLive: Layer.Layer<Input, never, CliFlags> = Layer.effect(
  Input,
  Effect.gen(function* () {
    const flags = yield* CliFlags;
    const ni = flags.nonInteractive;
    return {
      text: (config) => guardedPrompt(ni, () => p.text(asClack(config))),
      password: (config) => guardedPrompt(ni, () => p.password(asClack(config))),
      confirm: (config) => guardedPrompt(ni, () => p.confirm(asClack(config))),
      select: (config) => guardedPrompt(ni, () => p.select(asClack(config))),
      multiselect: (config) => guardedPrompt(ni, () => p.multiselect(asClack(config))),
      groupMultiselect: (config) => guardedPrompt(ni, () => p.groupMultiselect(asClack(config))),
      selectKey: (config) => guardedPrompt(ni, () => p.selectKey(asClack(config))),
      autocomplete: (config) => guardedPrompt(ni, () => p.autocomplete(asClack(config))),
      autocompleteMultiselect: (config) =>
        guardedPrompt(ni, () => p.autocompleteMultiselect(asClack(config))),
      path: (config) => guardedPrompt(ni, () => p.path(asClack(config))),
    };
  }),
);
