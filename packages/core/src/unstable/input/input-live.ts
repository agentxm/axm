import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { isNonInteractive } from "../utils/environment.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  makeTokenizedAutocompleteOptions,
  makeTokenizedGroupedOptions,
  makeTokenizedOptions,
  resolveTokenValue,
  resolveTokenValues,
} from "../clack-prompt-options.js";
import { PromptCancelled } from "../prompt-cancelled.js";
import {
  Input,
  type AutocompleteConfig,
  type AutocompleteMultiselectConfig,
  type ConfirmConfig,
  type GroupMultiselectConfig,
  type MultiselectConfig,
  type PasswordConfig,
  type PathConfig,
  type SelectConfig,
  type SelectKeyConfig,
  type TextConfig,
} from "./input.js";

const toClackTextOptions = (config: TextConfig): p.TextOptions => ({
  message: config.message,
  ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
  ...(config.defaultValue !== undefined && { defaultValue: config.defaultValue }),
  ...(config.initialValue !== undefined && { initialValue: config.initialValue }),
  ...(config.validate !== undefined && { validate: config.validate }),
});

const toClackPasswordOptions = (config: PasswordConfig): p.PasswordOptions => ({
  message: config.message,
  ...(config.mask !== undefined && { mask: config.mask }),
  ...(config.validate !== undefined && { validate: config.validate }),
  ...(config.clearOnError !== undefined && { clearOnError: config.clearOnError }),
});

const toClackConfirmOptions = (config: ConfirmConfig): p.ConfirmOptions => ({
  message: config.message,
  ...(config.active !== undefined && { active: config.active }),
  ...(config.inactive !== undefined && { inactive: config.inactive }),
  ...(config.initialValue !== undefined && { initialValue: config.initialValue }),
  ...(config.vertical !== undefined && { vertical: config.vertical }),
});

const toClackPathOptions = (config: PathConfig): p.PathOptions => ({
  message: config.message,
  ...(config.root !== undefined && { root: config.root }),
  ...(config.directory !== undefined && { directory: config.directory }),
  ...(config.initialValue !== undefined && { initialValue: config.initialValue }),
  ...(config.validate !== undefined && { validate: config.validate }),
});

const isPromptValue = <T>(value: T | symbol): value is T => !p.isCancel(value);

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
      !isPromptValue(result)
        ? Effect.fail(new PromptCancelled({ message: "Operation cancelled." }))
        : Effect.succeed(result),
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

export const InputLive = Layer.effect(
  Input,
  Effect.gen(function* () {
    const ni = yield* isNonInteractive;
    return {
      text: (config) => guardedPrompt(ni, () => p.text(toClackTextOptions(config))),
      password: (config) => guardedPrompt(ni, () => p.password(toClackPasswordOptions(config))),
      confirm: (config) => guardedPrompt(ni, () => p.confirm(toClackConfirmOptions(config))),
      select: <Value>(config: SelectConfig<Value>) => {
        const tokenized = makeTokenizedOptions(config.options);
        const initialToken =
          config.initialValue !== undefined ? tokenized.tokenForValue(config.initialValue) : undefined;

        return guardedPrompt(ni, () =>
          p.select({
            message: config.message,
            options: tokenized.options,
            ...(initialToken !== undefined && { initialValue: initialToken }),
            ...(config.maxItems !== undefined && { maxItems: config.maxItems }),
          }),
        ).pipe(Effect.flatMap((token) => resolveTokenValue("select", tokenized.resolveValue(token))));
      },
      multiselect: <Value>(config: MultiselectConfig<Value>) => {
        const tokenized = makeTokenizedOptions(config.options);
        const initialTokens =
          config.initialValues !== undefined
            ? tokenized.tokensForValues(config.initialValues)
            : undefined;
        const cursorAt =
          config.cursorAt !== undefined ? tokenized.tokenForValue(config.cursorAt) : undefined;

        return guardedPrompt(ni, () =>
          p.multiselect({
            message: config.message,
            options: tokenized.options,
            ...(initialTokens !== undefined && { initialValues: Array.from(initialTokens) }),
            ...(config.maxItems !== undefined && { maxItems: config.maxItems }),
            ...(config.required !== undefined && { required: config.required }),
            ...(cursorAt !== undefined && { cursorAt }),
          }),
        ).pipe(
          Effect.flatMap((tokens) => resolveTokenValues("multiselect", tokenized.resolveValues(tokens))),
        );
      },
      groupMultiselect: <Value>(config: GroupMultiselectConfig<Value>) => {
        const tokenized = makeTokenizedGroupedOptions(config.options);
        const initialTokens =
          config.initialValues !== undefined
            ? tokenized.tokensForValues(config.initialValues)
            : undefined;
        const cursorAt =
          config.cursorAt !== undefined ? tokenized.tokenForValue(config.cursorAt) : undefined;

        return guardedPrompt(ni, () =>
          p.groupMultiselect({
            message: config.message,
            options: tokenized.groupedOptions,
            ...(initialTokens !== undefined && { initialValues: Array.from(initialTokens) }),
            ...(config.required !== undefined && { required: config.required }),
            ...(cursorAt !== undefined && { cursorAt }),
            ...(config.selectableGroups !== undefined && {
              selectableGroups: config.selectableGroups,
            }),
            ...(config.groupSpacing !== undefined && { groupSpacing: config.groupSpacing }),
          }),
        ).pipe(
          Effect.flatMap((tokens) =>
            resolveTokenValues("groupMultiselect", tokenized.resolveValues(tokens)),
          ),
        );
      },
      selectKey: <Value extends string>(config: SelectKeyConfig<Value>) => {
        return guardedPrompt(ni, () =>
          p.selectKey<string>({
            message: config.message,
            options: config.options.map((option) => ({
              value: option.value,
              label: option.label ?? String(option.value),
              ...(option.hint !== undefined && { hint: option.hint }),
              ...(option.disabled !== undefined && { disabled: option.disabled }),
            })),
            ...(config.initialValue !== undefined && { initialValue: config.initialValue }),
            ...(config.caseSensitive !== undefined && { caseSensitive: config.caseSensitive }),
          }),
        ).pipe(
          Effect.flatMap((value) =>
            resolveTokenValue(
              "selectKey",
              config.options.find((option) => option.value === value)?.value,
            ),
          ),
        );
      },
      autocomplete: <Value>(config: AutocompleteConfig<Value>) => {
        const tokenized = makeTokenizedAutocompleteOptions(config.options);
        const initialToken =
          config.initialValue !== undefined ? tokenized.tokenForValue(config.initialValue) : undefined;
        const validate = config.validate;
        const filter = config.filter;

        return guardedPrompt(ni, () =>
          p.autocomplete({
            message: config.message,
            options: tokenized.autocompleteOptions,
            ...(config.maxItems !== undefined && { maxItems: config.maxItems }),
            ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
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
            ...(config.initialUserInput !== undefined && {
              initialUserInput: config.initialUserInput,
            }),
          }),
        ).pipe(
          Effect.flatMap((token) =>
            resolveTokenValue("autocomplete", tokenized.resolveValue(token)),
          ),
        );
      },
      autocompleteMultiselect: <Value>(config: AutocompleteMultiselectConfig<Value>) => {
        const tokenized = makeTokenizedAutocompleteOptions(config.options);
        const initialTokens =
          config.initialValues !== undefined
            ? tokenized.tokensForValues(config.initialValues)
            : undefined;
        const validate = config.validate;
        const filter = config.filter;

        return guardedPrompt(ni, () =>
          p.autocompleteMultiselect({
            message: config.message,
            options: tokenized.autocompleteOptions,
            ...(config.maxItems !== undefined && { maxItems: config.maxItems }),
            ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
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
            ...(config.required !== undefined && { required: config.required }),
          }),
        ).pipe(
          Effect.flatMap((tokens) =>
            resolveTokenValues("autocompleteMultiselect", tokenized.resolveValues(tokens)),
          ),
        );
      },
      path: (config) => guardedPrompt(ni, () => p.path(toClackPathOptions(config))),
    };
  }),
);
