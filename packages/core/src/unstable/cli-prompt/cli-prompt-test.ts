import { isDeepStrictEqual } from "node:util";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type {
  ConfirmOpts,
  PasswordOpts,
  PathOpts,
  TextOpts,
} from "./cli-prompt.js";
import { CliPrompt } from "./cli-prompt.js";

// ---------------------------------------------------------------------------
// Config — canned responses to supply to the test layer
// ---------------------------------------------------------------------------

export interface TestPromptConfig {
  readonly textResponses?: ReadonlyArray<string>;
  readonly passwordResponses?: ReadonlyArray<string>;
  readonly confirmResponses?: ReadonlyArray<boolean>;
  readonly selectResponses?: ReadonlyArray<unknown>;
  readonly multiselectResponses?: ReadonlyArray<ReadonlyArray<unknown>>;
  readonly groupMultiselectResponses?: ReadonlyArray<ReadonlyArray<unknown>>;
  readonly selectKeyResponses?: ReadonlyArray<string>;
  readonly autocompleteResponses?: ReadonlyArray<unknown>;
  readonly autocompleteMultiselectResponses?: ReadonlyArray<ReadonlyArray<unknown>>;
  readonly pathResponses?: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// State — mutable call recording exposed to assertions
// ---------------------------------------------------------------------------

export interface TestPromptState {
  readonly textCalls: Array<TextOpts>;
  readonly passwordCalls: Array<PasswordOpts>;
  readonly confirmCalls: Array<ConfirmOpts>;
  readonly selectCalls: Array<unknown>;
  readonly multiselectCalls: Array<unknown>;
  readonly groupMultiselectCalls: Array<unknown>;
  readonly selectKeyCalls: Array<unknown>;
  readonly autocompleteCalls: Array<unknown>;
  readonly autocompleteMultiselectCalls: Array<unknown>;
  readonly pathCalls: Array<PathOpts>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const makeQueue = <T>(items: ReadonlyArray<T> | undefined): Array<T> => Array.from(items ?? []);

const popValue = (queue: Array<unknown>, method: string): Effect.Effect<unknown> => {
  const value = queue.shift();
  if (value === undefined) {
    return Effect.die(
      new Error(
        `TestPrompt: no canned response for "${method}" — queue is empty. ` +
        `Add more responses to TestPromptConfig.${method}Responses.`,
      ),
    );
  }
  return Effect.succeed(value);
};

const dieInvalidResponse = (method: string, message: string): Effect.Effect<never> =>
  Effect.die(new Error(`TestPrompt: invalid canned response for "${method}" — ${message}`));

const stringifyForError = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const matchesOptionValue = <T>(candidate: T, rawValue: unknown): boolean =>
  Object.is(candidate, rawValue) || isDeepStrictEqual(candidate, rawValue);

const findOptionValue = <T>(
  options: ReadonlyArray<{ readonly value: T }>,
  rawValue: unknown,
  method: string,
): Effect.Effect<T> => {
  const option = options.find((entry) => matchesOptionValue(entry.value, rawValue));
  if (option === undefined) {
    return dieInvalidResponse(method, "response did not match any option value");
  }
  return Effect.succeed(option.value);
};

const findOptionValues = <T>(
  options: ReadonlyArray<{ readonly value: T }>,
  rawValue: unknown,
  method: string,
): Effect.Effect<ReadonlyArray<T>> => {
  if (!Array.isArray(rawValue)) {
    return dieInvalidResponse(method, "expected an array of option values");
  }

  const values: Array<T> = [];
  for (const entry of rawValue) {
    const option = options.find((candidate) => matchesOptionValue(candidate.value, entry));
    if (option === undefined) {
      return dieInvalidResponse(
        method,
        `one or more responses did not match an option value (response=${stringifyForError(entry)}, options=${stringifyForError(options.map((candidate) => candidate.value))})`,
      );
    }
    values.push(option.value);
  }
  return Effect.succeed(values);
};

const flattenGroupedOptions = <T>(
  options: Record<string, ReadonlyArray<{ readonly value: T }>>,
): ReadonlyArray<{ readonly value: T }> => Object.values(options).flat();

const resolveAutocompleteOptions = <T>(
  options:
    | ReadonlyArray<{ readonly value: T }>
    | (() => ReadonlyArray<{ readonly value: T }>),
): ReadonlyArray<{ readonly value: T }> => (typeof options === "function" ? options() : options);

export const makeTestPrompt = (
  config: TestPromptConfig = {},
): readonly [Layer.Layer<CliPrompt>, TestPromptState] => {
  const state: TestPromptState = {
    textCalls: [],
    passwordCalls: [],
    confirmCalls: [],
    selectCalls: [],
    multiselectCalls: [],
    groupMultiselectCalls: [],
    selectKeyCalls: [],
    autocompleteCalls: [],
    autocompleteMultiselectCalls: [],
    pathCalls: [],
  };

  const textQueue = makeQueue(config.textResponses);
  const passwordQueue = makeQueue(config.passwordResponses);
  const confirmQueue = makeQueue(config.confirmResponses);
  const selectQueue = makeQueue(config.selectResponses);
  const multiselectQueue = makeQueue(config.multiselectResponses);
  const groupMultiselectQueue = makeQueue(config.groupMultiselectResponses);
  const selectKeyQueue = makeQueue(config.selectKeyResponses);
  const autocompleteQueue = makeQueue(config.autocompleteResponses);
  const autocompleteMultiselectQueue = makeQueue(config.autocompleteMultiselectResponses);
  const pathQueue = makeQueue(config.pathResponses);

  const layer = Layer.succeed(CliPrompt, {
    text: (opts) => {
      state.textCalls.push(opts);
      const response = textQueue.shift();
      if (response === undefined) {
        return dieInvalidResponse("text", "queue is empty");
      }
      return Effect.succeed(response);
    },
    password: (opts) => {
      state.passwordCalls.push(opts);
      const response = passwordQueue.shift();
      if (response === undefined) {
        return dieInvalidResponse("password", "queue is empty");
      }
      return Effect.succeed(response);
    },
    confirm: (opts) => {
      state.confirmCalls.push(opts);
      const response = confirmQueue.shift();
      if (response === undefined) {
        return dieInvalidResponse("confirm", "queue is empty");
      }
      return Effect.succeed(response);
    },
    select: (opts) => {
      state.selectCalls.push(opts);
      return popValue(selectQueue, "select").pipe(
        Effect.flatMap((response) => findOptionValue(opts.options, response, "select")),
      );
    },
    multiselect: (opts) => {
      state.multiselectCalls.push(opts);
      return popValue(multiselectQueue, "multiselect").pipe(
        Effect.flatMap((response) => findOptionValues(opts.options, response, "multiselect")),
      );
    },
    groupMultiselect: (opts) => {
      state.groupMultiselectCalls.push(opts);
      return popValue(groupMultiselectQueue, "groupMultiselect").pipe(
        Effect.flatMap((response) =>
          findOptionValues(flattenGroupedOptions(opts.options), response, "groupMultiselect"),
        ),
      );
    },
    selectKey: (opts) => {
      state.selectKeyCalls.push(opts);
      return popValue(selectKeyQueue, "selectKey").pipe(
        Effect.flatMap((response) => findOptionValue(opts.options, response, "selectKey")),
      );
    },
    autocomplete: (opts) => {
      state.autocompleteCalls.push(opts);
      return popValue(autocompleteQueue, "autocomplete").pipe(
        Effect.flatMap((response) =>
          findOptionValue(resolveAutocompleteOptions(opts.options), response, "autocomplete"),
        ),
      );
    },
    autocompleteMultiselect: (opts) => {
      state.autocompleteMultiselectCalls.push(opts);
      return popValue(autocompleteMultiselectQueue, "autocompleteMultiselect").pipe(
        Effect.flatMap((response) =>
          findOptionValues(
            resolveAutocompleteOptions(opts.options),
            response,
            "autocompleteMultiselect",
          ),
        ),
      );
    },
    path: (opts) => {
      state.pathCalls.push(opts);
      const response = pathQueue.shift();
      if (response === undefined) {
        return dieInvalidResponse("path", "queue is empty");
      }
      return Effect.succeed(response);
    },
  });

  return [layer, state] as const;
};
