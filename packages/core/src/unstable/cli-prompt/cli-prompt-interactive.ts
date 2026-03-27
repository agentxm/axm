import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeAppError } from "../app-error/index.js";
import {
  makeTokenizedAutocompleteOptions,
  makeTokenizedGroupedOptions,
  makeTokenizedOptions,
  resolveTokenValue,
  resolveTokenValues,
} from "./clack-prompt-options.js";
import { PromptCancelled } from "./prompt-cancelled.js";
import {
  CliPrompt,
  type AutocompleteMultiselectOpts,
  type AutocompleteOpts,
  type ConfirmOpts,
  type GroupMultiselectOpts,
  type MultiselectOpts,
  type PasswordOpts,
  type PathOpts,
  type SelectKeyOpts,
  type SelectOpts,
  type TextOpts,
} from "./cli-prompt.js";

const toClackTextOptions = (opts: TextOpts): p.TextOptions => ({
  message: opts.message,
  ...(opts.placeholder !== undefined && { placeholder: opts.placeholder }),
  ...(opts.defaultValue !== undefined && { defaultValue: opts.defaultValue }),
  ...(opts.initialValue !== undefined && { initialValue: opts.initialValue }),
  ...(opts.validate !== undefined && { validate: opts.validate }),
});

const toClackPasswordOptions = (opts: PasswordOpts): p.PasswordOptions => ({
  message: opts.message,
  ...(opts.mask !== undefined && { mask: opts.mask }),
  ...(opts.validate !== undefined && { validate: opts.validate }),
  ...(opts.clearOnError !== undefined && { clearOnError: opts.clearOnError }),
});

const toClackConfirmOptions = (opts: ConfirmOpts): p.ConfirmOptions => ({
  message: opts.message,
  ...(opts.active !== undefined && { active: opts.active }),
  ...(opts.inactive !== undefined && { inactive: opts.inactive }),
  ...(opts.initialValue !== undefined && { initialValue: opts.initialValue }),
  ...(opts.vertical !== undefined && { vertical: opts.vertical }),
});

const toClackPathOptions = (opts: PathOpts): p.PathOptions => ({
  message: opts.message,
  ...(opts.root !== undefined && { root: opts.root }),
  ...(opts.directory !== undefined && { directory: opts.directory }),
  ...(opts.initialValue !== undefined && { initialValue: opts.initialValue }),
  ...(opts.validate !== undefined && { validate: opts.validate }),
});

const isPromptValue = <T>(value: T | symbol): value is T => !p.isCancel(value);

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
    if (!isPromptValue(result)) {
      return yield* Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    return result;
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
      guardedPrompt(nonInteractive, opts.defaultValue, opts.message, () =>
        p.text(toClackTextOptions(opts)),
      ),
    password: (opts) =>
      guardedPrompt(nonInteractive, undefined, opts.message, () =>
        p.password(toClackPasswordOptions(opts)),
      ),
    confirm: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValue, opts.message, () =>
        p.confirm(toClackConfirmOptions(opts)),
      ),
    select: <Value>(opts: SelectOpts<Value>) => {
      const tokenized = makeTokenizedOptions(opts.options);
      const initialToken =
        opts.initialValue !== undefined ? tokenized.tokenForValue(opts.initialValue) : undefined;

      return guardedPrompt(nonInteractive, initialToken, opts.message, () =>
        p.select({
          message: opts.message,
          options: tokenized.options,
          ...(initialToken !== undefined && { initialValue: initialToken }),
          ...(opts.maxItems !== undefined && { maxItems: opts.maxItems }),
        }),
      ).pipe(Effect.flatMap((token) => resolveTokenValue("select", tokenized.resolveValue(token))));
    },
    multiselect: <Value>(opts: MultiselectOpts<Value>) => {
      const tokenized = makeTokenizedOptions(opts.options);
      const initialTokens =
        opts.initialValues !== undefined
          ? tokenized.tokensForValues(opts.initialValues)
          : undefined;
      const cursorAt =
        opts.cursorAt !== undefined ? tokenized.tokenForValue(opts.cursorAt) : undefined;

      return guardedPrompt(nonInteractive, initialTokens, opts.message, () =>
        p.multiselect({
          message: opts.message,
          options: tokenized.options,
          ...(initialTokens !== undefined && { initialValues: Array.from(initialTokens) }),
          ...(opts.maxItems !== undefined && { maxItems: opts.maxItems }),
          ...(opts.required !== undefined && { required: opts.required }),
          ...(cursorAt !== undefined && { cursorAt }),
        }),
      ).pipe(
        Effect.flatMap((tokens) =>
          resolveTokenValues("multiselect", tokenized.resolveValues(tokens)),
        ),
      );
    },
    groupMultiselect: <Value>(opts: GroupMultiselectOpts<Value>) => {
      const tokenized = makeTokenizedGroupedOptions(opts.options);
      const initialTokens =
        opts.initialValues !== undefined
          ? tokenized.tokensForValues(opts.initialValues)
          : undefined;
      const cursorAt =
        opts.cursorAt !== undefined ? tokenized.tokenForValue(opts.cursorAt) : undefined;

      return guardedPrompt(nonInteractive, initialTokens, opts.message, () =>
        p.groupMultiselect({
          message: opts.message,
          options: tokenized.groupedOptions,
          ...(initialTokens !== undefined && { initialValues: Array.from(initialTokens) }),
          ...(opts.required !== undefined && { required: opts.required }),
          ...(cursorAt !== undefined && { cursorAt }),
          ...(opts.selectableGroups !== undefined && { selectableGroups: opts.selectableGroups }),
          ...(opts.groupSpacing !== undefined && { groupSpacing: opts.groupSpacing }),
        }),
      ).pipe(
        Effect.flatMap((tokens) =>
          resolveTokenValues("groupMultiselect", tokenized.resolveValues(tokens)),
        ),
      );
    },
    selectKey: <Value extends string>(opts: SelectKeyOpts<Value>) => {
      return guardedPrompt(nonInteractive, opts.initialValue, opts.message, () =>
        p.selectKey<string>({
          message: opts.message,
          options: opts.options.map((option) => ({
            value: option.value,
            label: option.label ?? String(option.value),
            ...(option.hint !== undefined && { hint: option.hint }),
            ...(option.disabled !== undefined && { disabled: option.disabled }),
          })),
          ...(opts.initialValue !== undefined && { initialValue: opts.initialValue }),
          ...(opts.caseSensitive !== undefined && { caseSensitive: opts.caseSensitive }),
        }),
      ).pipe(
        Effect.flatMap((value) =>
          resolveTokenValue(
            "selectKey",
            opts.options.find((option) => option.value === value)?.value,
          ),
        ),
      );
    },
    autocomplete: <Value>(opts: AutocompleteOpts<Value>) => {
      const tokenized = makeTokenizedAutocompleteOptions(opts.options);
      const initialToken =
        opts.initialValue !== undefined ? tokenized.tokenForValue(opts.initialValue) : undefined;
      const validate = opts.validate;
      const filter = opts.filter;

      return guardedPrompt(nonInteractive, initialToken, opts.message, () =>
        p.autocomplete({
          message: opts.message,
          options: tokenized.autocompleteOptions,
          ...(opts.maxItems !== undefined && { maxItems: opts.maxItems }),
          ...(opts.placeholder !== undefined && { placeholder: opts.placeholder }),
          ...(validate !== undefined && {
            validate: (token: string | ReadonlyArray<string> | undefined) =>
              validate(
                typeof token === "string"
                  ? tokenized.resolveValue(token)
                  : token === undefined
                    ? undefined
                    : tokenized.resolveValues(Array.from(token)),
              ),
          }),
          ...(filter !== undefined && {
            filter: (search: string, option: p.Option<string>) => {
              const original = tokenized.resolveOption(option.value);
              return original === undefined ? false : filter(search, original);
            },
          }),
          ...(initialToken !== undefined && { initialValue: initialToken }),
          ...(opts.initialUserInput !== undefined && { initialUserInput: opts.initialUserInput }),
        }),
      ).pipe(
        Effect.flatMap((token) => resolveTokenValue("autocomplete", tokenized.resolveValue(token))),
      );
    },
    autocompleteMultiselect: <Value>(opts: AutocompleteMultiselectOpts<Value>) => {
      const tokenized = makeTokenizedAutocompleteOptions(opts.options);
      const initialTokens =
        opts.initialValues !== undefined
          ? tokenized.tokensForValues(opts.initialValues)
          : undefined;
      const validate = opts.validate;
      const filter = opts.filter;

      return guardedPrompt(nonInteractive, initialTokens, opts.message, () =>
        p.autocompleteMultiselect({
          message: opts.message,
          options: tokenized.autocompleteOptions,
          ...(opts.maxItems !== undefined && { maxItems: opts.maxItems }),
          ...(opts.placeholder !== undefined && { placeholder: opts.placeholder }),
          ...(validate !== undefined && {
            validate: (token: string | ReadonlyArray<string> | undefined) =>
              validate(
                typeof token === "string"
                  ? tokenized.resolveValue(token)
                  : token === undefined
                    ? undefined
                    : tokenized.resolveValues(Array.from(token)),
              ),
          }),
          ...(filter !== undefined && {
            filter: (search: string, option: p.Option<string>) => {
              const original = tokenized.resolveOption(option.value);
              return original === undefined ? false : filter(search, original);
            },
          }),
          ...(initialTokens !== undefined && { initialValues: Array.from(initialTokens) }),
          ...(opts.required !== undefined && { required: opts.required }),
        }),
      ).pipe(
        Effect.flatMap((tokens) =>
          resolveTokenValues("autocompleteMultiselect", tokenized.resolveValues(tokens)),
        ),
      );
    },
    path: (opts) =>
      guardedPrompt(nonInteractive, opts.initialValue, opts.message, () =>
        p.path(toClackPathOptions(opts)),
      ),
  });
