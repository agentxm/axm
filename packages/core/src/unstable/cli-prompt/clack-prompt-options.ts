import type * as p from "@clack/prompts";
import * as Effect from "effect/Effect";

export interface ClackPromptOption<Value> {
  readonly value: Value;
  readonly label?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

type TokenizedOptions<Value> = {
  readonly options: Array<p.Option<string>>;
  readonly resolveValue: (token: string) => Value | undefined;
  readonly resolveValues: (tokens: ReadonlyArray<string>) => ReadonlyArray<Value> | undefined;
  readonly resolveOption: (token: string) => ClackPromptOption<Value> | undefined;
  readonly tokenForValue: (value: Value) => string | undefined;
  readonly tokensForValues: (values: ReadonlyArray<Value>) => ReadonlyArray<string> | undefined;
};

type TokenizedGroupedOptions<Value> = TokenizedOptions<Value> & {
  readonly groupedOptions: Record<string, Array<p.Option<string>>>;
};

type TokenizedAutocompleteOptions<Value> = TokenizedOptions<Value> & {
  readonly autocompleteOptions:
    | Array<p.Option<string>>
    | ((this: unknown) => Array<p.Option<string>>);
};

const toTokenOption = (token: string, option: ClackPromptOption<unknown>): p.Option<string> => ({
  value: token,
  label: option.label ?? String(option.value),
  ...(option.hint !== undefined && { hint: option.hint }),
  ...(option.disabled !== undefined && { disabled: option.disabled }),
});

export const makeTokenizedOptions = <Value>(
  options: ReadonlyArray<ClackPromptOption<Value>>,
): TokenizedOptions<Value> => {
  const entries = options.map((option, index) => ({
    token: String(index),
    option,
  }));

  return {
    options: entries.map((entry) => toTokenOption(entry.token, entry.option)),
    resolveValue: (token) => entries.find((entry) => entry.token === token)?.option.value,
    resolveValues: (tokens) => {
      const values: Array<Value> = [];
      for (const token of tokens) {
        const entry = entries.find((candidate) => candidate.token === token);
        if (entry === undefined) {
          return undefined;
        }
        values.push(entry.option.value);
      }
      return values;
    },
    resolveOption: (token) => entries.find((entry) => entry.token === token)?.option,
    tokenForValue: (value) => entries.find((entry) => Object.is(entry.option.value, value))?.token,
    tokensForValues: (values) => {
      const tokens: Array<string> = [];
      for (const value of values) {
        const token = entries.find((entry) => Object.is(entry.option.value, value))?.token;
        if (token === undefined) {
          return undefined;
        }
        tokens.push(token);
      }
      return tokens;
    },
  };
};

export const makeTokenizedGroupedOptions = <Value>(
  groups: Record<string, ReadonlyArray<ClackPromptOption<Value>>>,
): TokenizedGroupedOptions<Value> => {
  const entries: Array<{ readonly token: string; readonly option: ClackPromptOption<Value> }> = [];
  const groupedOptions: Record<string, Array<p.Option<string>>> = {};
  let nextToken = 0;

  for (const [groupName, options] of Object.entries(groups)) {
    groupedOptions[groupName] = options.map((option) => {
      const token = String(nextToken++);
      entries.push({ token, option });
      return toTokenOption(token, option);
    });
  }

  return {
    groupedOptions,
    options: Object.values(groupedOptions).flat(),
    resolveValue: (token) => entries.find((entry) => entry.token === token)?.option.value,
    resolveValues: (tokens) => {
      const values: Array<Value> = [];
      for (const token of tokens) {
        const entry = entries.find((candidate) => candidate.token === token);
        if (entry === undefined) {
          return undefined;
        }
        values.push(entry.option.value);
      }
      return values;
    },
    resolveOption: (token) => entries.find((entry) => entry.token === token)?.option,
    tokenForValue: (value) => entries.find((entry) => Object.is(entry.option.value, value))?.token,
    tokensForValues: (values) => {
      const tokens: Array<string> = [];
      for (const value of values) {
        const token = entries.find((entry) => Object.is(entry.option.value, value))?.token;
        if (token === undefined) {
          return undefined;
        }
        tokens.push(token);
      }
      return tokens;
    },
  };
};

export const makeTokenizedAutocompleteOptions = <Value>(
  options:
    | ReadonlyArray<ClackPromptOption<Value>>
    | (() => ReadonlyArray<ClackPromptOption<Value>>),
): TokenizedAutocompleteOptions<Value> => {
  let current = makeTokenizedOptions(typeof options === "function" ? options() : options);

  return {
    autocompleteOptions:
      typeof options === "function"
        ? function () {
            current = makeTokenizedOptions(options());
            return current.options;
          }
        : current.options,
    options: current.options,
    resolveValue: (token) => current.resolveValue(token),
    resolveValues: (tokens) => current.resolveValues(tokens),
    resolveOption: (token) => current.resolveOption(token),
    tokenForValue: (value) => current.tokenForValue(value),
    tokensForValues: (values) => current.tokensForValues(values),
  };
};

export const resolveTokenValue = <Value>(
  prompt: string,
  value: Value | undefined,
): Effect.Effect<Value, never> =>
  value === undefined
    ? Effect.die(new Error(`Prompt adapter invariant failed for "${prompt}"`))
    : Effect.succeed(value);

export const resolveTokenValues = <Value>(
  prompt: string,
  values: ReadonlyArray<Value> | undefined,
): Effect.Effect<ReadonlyArray<Value>, never> =>
  values === undefined
    ? Effect.die(new Error(`Prompt adapter invariant failed for "${prompt}"`))
    : Effect.succeed(values);
