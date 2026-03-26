import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeAppError } from "../app-error/index.js";
import { PromptCancelled } from "../prompt-cancelled.js";
import { CliPrompt } from "./cli-prompt.js";

// Assertion needed: our readonly config types are structurally compatible with Clack's
// mutable types, but exactOptionalPropertyTypes prevents direct assignment.
const asClack = <T>(config: unknown): T => config as T;

const wrapPrompt = <T>(thunk: () => Promise<T | symbol>): Effect.Effect<T, PromptCancelled> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => thunk(),
      catch: (error) =>
        makeAppError({
          code: "PROMPT_RENDER_FAILED",
          what: "Prompt failed to render",
          cause: error,
        }),
    }).pipe(
      // Render failures are defects, not expected errors
      Effect.catch((error) => Effect.die(error)),
    );
    if (p.isCancel(result)) {
      return yield* Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    // Assertion needed: p.isCancel() narrows to T but TS doesn't track it through the symbol union
    return result as T;
  });

const dieNonInteractive = (message: string): Effect.Effect<never> =>
  Effect.die(
    makeAppError({
      code: "PROMPT_REQUIRED",
      what: `Interactive prompt required: ${message}`,
      howToFix: "Pass the value via a flag or set a default, or remove --non-interactive",
    }),
  );

const guardedPrompt = <T>(
  nonInteractive: boolean,
  defaultValue: T | undefined,
  message: string,
  thunk: () => Promise<T | symbol>,
): Effect.Effect<T, PromptCancelled> =>
  nonInteractive
    ? defaultValue !== undefined
      ? Effect.succeed(defaultValue)
      : dieNonInteractive(message)
    : wrapPrompt(thunk);

/**
 * Construct an InteractivePrompt layer.
 * When nonInteractive is true: prompts with a default silently use it;
 * prompts without a default die with PROMPT_REQUIRED (defect).
 */
export const makeInteractivePrompt = (nonInteractive: boolean): Layer.Layer<CliPrompt> =>
  Layer.succeed(CliPrompt, {
    text: (opts) =>
      guardedPrompt(nonInteractive, opts.defaultValue, opts.message, () => p.text(asClack(opts))),
    password: (opts) =>
      guardedPrompt(nonInteractive, undefined, opts.message, () => p.password(asClack(opts))),
    confirm: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValue, opts.message, () =>
        p.confirm(asClack(opts)),
      ),
    select: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValue, opts.message, () => p.select(asClack(opts))),
    multiselect: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValues, opts.message, () =>
        p.multiselect(asClack(opts)),
      ),
    groupMultiselect: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValues, opts.message, () =>
        p.groupMultiselect(asClack(opts)),
      ),
    selectKey: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValue, opts.message, () =>
        p.selectKey(asClack(opts)),
      ),
    autocomplete: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValue, opts.message, () =>
        p.autocomplete(asClack(opts)),
      ),
    autocompleteMultiselect: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValues, opts.message, () =>
        p.autocompleteMultiselect(asClack(opts)),
      ),
    path: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValue, opts.message, () => p.path(asClack(opts))),
  });
