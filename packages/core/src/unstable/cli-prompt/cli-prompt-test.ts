import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type {
  AutocompleteMultiselectOpts,
  AutocompleteOpts,
  ConfirmOpts,
  GroupMultiselectOpts,
  MultiselectOpts,
  PasswordOpts,
  PathOpts,
  SelectKeyOpts,
  SelectOpts,
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
  readonly selectCalls: Array<SelectOpts<unknown>>;
  readonly multiselectCalls: Array<MultiselectOpts<unknown>>;
  readonly groupMultiselectCalls: Array<GroupMultiselectOpts<unknown>>;
  readonly selectKeyCalls: Array<SelectKeyOpts<string>>;
  readonly autocompleteCalls: Array<AutocompleteOpts<unknown>>;
  readonly autocompleteMultiselectCalls: Array<AutocompleteMultiselectOpts<unknown>>;
  readonly pathCalls: Array<PathOpts>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const makeQueue = <T>(items: ReadonlyArray<T> | undefined): Array<T> => Array.from(items ?? []);

// Assertion needed: test mock queues store `unknown` but generic methods expect `V`.
// This is acceptable per conventions — single assertion at mock boundary.
const popAs = <T>(queue: Array<unknown>, method: string): Effect.Effect<T> => {
  const value = queue.shift();
  if (value === undefined) {
    return Effect.die(
      new Error(
        `TestPrompt: no canned response for "${method}" — queue is empty. ` +
          `Add more responses to TestPromptConfig.${method}Responses.`,
      ),
    );
  }
  return Effect.succeed(value as T);
};

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

  // Assertion needed: generic method opts are stored in unknown-typed arrays at mock boundary.
  const pushOpts = <T>(calls: Array<T>, opts: unknown) => {
    calls.push(opts as T);
  };

  const layer = Layer.succeed(CliPrompt, {
    text: (opts) => {
      state.textCalls.push(opts);
      return popAs<string>(textQueue, "text");
    },
    password: (opts) => {
      state.passwordCalls.push(opts);
      return popAs<string>(passwordQueue, "password");
    },
    confirm: (opts) => {
      state.confirmCalls.push(opts);
      return popAs<boolean>(confirmQueue, "confirm");
    },
    select: (opts) => {
      pushOpts(state.selectCalls, opts);
      return popAs(selectQueue, "select");
    },
    multiselect: (opts) => {
      pushOpts(state.multiselectCalls, opts);
      return popAs(multiselectQueue, "multiselect");
    },
    groupMultiselect: (opts) => {
      pushOpts(state.groupMultiselectCalls, opts);
      return popAs(groupMultiselectQueue, "groupMultiselect");
    },
    selectKey: (opts) => {
      pushOpts(state.selectKeyCalls, opts);
      return popAs(selectKeyQueue, "selectKey");
    },
    autocomplete: (opts) => {
      pushOpts(state.autocompleteCalls, opts);
      return popAs(autocompleteQueue, "autocomplete");
    },
    autocompleteMultiselect: (opts) => {
      pushOpts(state.autocompleteMultiselectCalls, opts);
      return popAs(autocompleteMultiselectQueue, "autocompleteMultiselect");
    },
    path: (opts) => {
      state.pathCalls.push(opts);
      return popAs<string>(pathQueue, "path");
    },
  });

  return [layer, state] as const;
};
