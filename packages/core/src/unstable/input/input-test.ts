import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../prompt-cancelled.js";
import type { AppError } from "../app-error/index.js";
import {
  Input,
  type AutocompleteConfig,
  type AutocompleteMultiselectConfig,
  type ConfirmConfig,
  type GroupMultiselectConfig,
  type InputOption,
  type MultiselectConfig,
  type PasswordConfig,
  type PathConfig,
  type SelectConfig,
  type SelectKeyConfig,
  type TextConfig,
} from "./input.js";

export interface InputCall {
  readonly method: string;
  readonly config: unknown;
}

export interface InputBehavior {
  readonly type: "return";
  readonly value: unknown;
}

export interface InputCancelBehavior {
  readonly type: "cancel";
}

export interface InputSelectBehavior {
  readonly type: "select";
  readonly index: number;
}

export interface InputMultiselectBehavior {
  readonly type: "multiselect";
  readonly indices: ReadonlyArray<number>;
}

export type InputPromptBehavior =
  | InputBehavior
  | InputCancelBehavior
  | InputSelectBehavior
  | InputMultiselectBehavior;

type InputMethod =
  | "text"
  | "password"
  | "confirm"
  | "select"
  | "multiselect"
  | "groupMultiselect"
  | "selectKey"
  | "autocomplete"
  | "autocompleteMultiselect"
  | "path";

export interface InputTestLayerConfig {
  readonly defaultBehavior?: InputPromptBehavior;
  readonly methodBehaviors?: Partial<Record<InputMethod, InputPromptBehavior>>;
  readonly queuedBehaviors?: ReadonlyArray<InputPromptBehavior>;
  readonly queuedBehaviorsByMethod?: Partial<
    Record<InputMethod, ReadonlyArray<InputPromptBehavior>>
  >;
}

export interface MockInputService {
  readonly calls: Array<InputCall>;
}

const defaultBehavior: InputPromptBehavior = { type: "return", value: "" };

const isBehavior = (value: unknown): value is InputPromptBehavior =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  (value.type === "return" ||
    value.type === "cancel" ||
    value.type === "select" ||
    value.type === "multiselect");

export const makeInputTestLayer = (
  configOrBehavior: InputPromptBehavior | InputTestLayerConfig = defaultBehavior,
): readonly [Layer.Layer<Input>, MockInputService] => {
  const mock: MockInputService = { calls: [] };

  const resolvedConfig: InputTestLayerConfig = isBehavior(configOrBehavior)
    ? { defaultBehavior: configOrBehavior }
    : configOrBehavior;

  const queuedBehaviors = Array.from(resolvedConfig.queuedBehaviors ?? []);

  const queuedBehaviorsByMethod: Record<InputMethod, InputPromptBehavior[]> = {
    text: Array.from(resolvedConfig.queuedBehaviorsByMethod?.text ?? []),
    password: Array.from(resolvedConfig.queuedBehaviorsByMethod?.password ?? []),
    confirm: Array.from(resolvedConfig.queuedBehaviorsByMethod?.confirm ?? []),
    select: Array.from(resolvedConfig.queuedBehaviorsByMethod?.select ?? []),
    multiselect: Array.from(resolvedConfig.queuedBehaviorsByMethod?.multiselect ?? []),
    groupMultiselect: Array.from(resolvedConfig.queuedBehaviorsByMethod?.groupMultiselect ?? []),
    selectKey: Array.from(resolvedConfig.queuedBehaviorsByMethod?.selectKey ?? []),
    autocomplete: Array.from(resolvedConfig.queuedBehaviorsByMethod?.autocomplete ?? []),
    autocompleteMultiselect: Array.from(
      resolvedConfig.queuedBehaviorsByMethod?.autocompleteMultiselect ?? [],
    ),
    path: Array.from(resolvedConfig.queuedBehaviorsByMethod?.path ?? []),
  };

  const resolveBehavior = (method: InputMethod): InputPromptBehavior => {
    const queuedMethodBehaviors = queuedBehaviorsByMethod[method];
    const queuedMethodBehavior = queuedMethodBehaviors[0];
    if (queuedMethodBehavior) {
      queuedMethodBehaviors.shift();
      return queuedMethodBehavior;
    }

    const queuedBehavior = queuedBehaviors[0];
    if (queuedBehavior) {
      queuedBehaviors.shift();
      return queuedBehavior;
    }

    return (
      resolvedConfig.methodBehaviors?.[method] ?? resolvedConfig.defaultBehavior ?? defaultBehavior
    );
  };

  const dieInvalidBehavior = (method: InputMethod, message: string): Effect.Effect<never> =>
    Effect.die(new Error(`Test setup error for ${method}: ${message}`));

  const resolveOptionValue = <A>(
    options: ReadonlyArray<InputOption<A>>,
    index: number,
    method: InputMethod,
  ): Effect.Effect<A> => {
    const option = options[index];
    if (option === undefined) {
      return dieInvalidBehavior(method, `index ${String(index)} out of bounds`);
    }
    return Effect.succeed(option.value);
  };

  const resolveOptionValueByMatch = <A>(
    options: ReadonlyArray<InputOption<A>>,
    value: unknown,
    method: InputMethod,
  ): Effect.Effect<A> => {
    const option = options.find((entry) => Object.is(entry.value, value));
    if (option === undefined) {
      return dieInvalidBehavior(method, "response did not match any option value");
    }
    return Effect.succeed(option.value);
  };

  const resolveOptionValues = <A>(
    options: ReadonlyArray<InputOption<A>>,
    indices: ReadonlyArray<number>,
    method: InputMethod,
  ): Effect.Effect<ReadonlyArray<A>> => {
    const values: Array<A> = [];
    for (const index of indices) {
      const option = options[index];
      if (option === undefined) {
        return dieInvalidBehavior(method, `index ${String(index)} out of bounds`);
      }
      values.push(option.value);
    }
    return Effect.succeed(values);
  };

  const resolveOptionValuesByMatch = <A>(
    options: ReadonlyArray<InputOption<A>>,
    value: unknown,
    method: InputMethod,
  ): Effect.Effect<ReadonlyArray<A>> => {
    if (!Array.isArray(value)) {
      return dieInvalidBehavior(method, "expected an array of option values");
    }

    const values: Array<A> = [];
    for (const entry of value) {
      const option = options.find((candidate) => Object.is(candidate.value, entry));
      if (option === undefined) {
        return dieInvalidBehavior(method, "one or more responses did not match an option value");
      }
      values.push(option.value);
    }
    return Effect.succeed(values);
  };

  const resolveAutocompleteOptions = <A>(
    options: ReadonlyArray<InputOption<A>> | (() => ReadonlyArray<InputOption<A>>),
  ): ReadonlyArray<InputOption<A>> => (typeof options === "function" ? options() : options);

  const flattenGroupedOptions = <A>(
    options: Record<string, ReadonlyArray<InputOption<A>>>,
  ): ReadonlyArray<InputOption<A>> => Object.values(options).flat();

  const recordCall = (method: InputMethod, config: unknown): InputPromptBehavior => {
    mock.calls.push({ method, config });
    return resolveBehavior(method);
  };

  const runStringPrompt = (
    method: InputMethod,
    config: TextConfig | PasswordConfig | PathConfig,
  ): Effect.Effect<string, AppError | PromptCancelled> => {
    const behavior = recordCall(method, config);
    if (behavior.type === "cancel") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    if (behavior.type === "return") {
      if (typeof behavior.value === "string") {
        return Effect.succeed(behavior.value);
      }
      return dieInvalidBehavior(method, "expected a string response");
    }
    return dieInvalidBehavior(method, "expected a return or cancel behavior");
  };

  const runBooleanPrompt = (
    method: InputMethod,
    config: ConfirmConfig,
  ): Effect.Effect<boolean, AppError | PromptCancelled> => {
    const behavior = recordCall(method, config);
    if (behavior.type === "cancel") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    if (behavior.type === "return") {
      if (typeof behavior.value === "boolean") {
        return Effect.succeed(behavior.value);
      }
      return dieInvalidBehavior(method, "expected a boolean response");
    }
    return dieInvalidBehavior(method, "expected a return or cancel behavior");
  };

  const runSelectPrompt = <A>(
    method: InputMethod,
    config: SelectConfig<A> | AutocompleteConfig<A>,
  ): Effect.Effect<A, AppError | PromptCancelled> => {
    const behavior = recordCall(method, config);
    const options =
      "options" in config && typeof config.options !== "function"
        ? config.options
        : resolveAutocompleteOptions(config.options);

    if (behavior.type === "cancel") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    if (behavior.type === "return") {
      return resolveOptionValueByMatch(options, behavior.value, method);
    }
    if (behavior.type === "select") {
      return resolveOptionValue(options, behavior.index, method);
    }
    return dieInvalidBehavior(method, "expected a single-select behavior");
  };

  const runSelectKeyPrompt = <A extends string>(
    method: InputMethod,
    config: SelectKeyConfig<A>,
  ): Effect.Effect<A, AppError | PromptCancelled> => {
    const behavior = recordCall(method, config);

    if (behavior.type === "cancel") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    if (behavior.type === "return") {
      return resolveOptionValueByMatch(config.options, behavior.value, method);
    }
    if (behavior.type === "select") {
      return resolveOptionValue(config.options, behavior.index, method);
    }
    return dieInvalidBehavior(method, "expected a single-select behavior");
  };

  const runMultiselectPrompt = <A>(
    method: InputMethod,
    config: MultiselectConfig<A> | AutocompleteMultiselectConfig<A>,
  ): Effect.Effect<ReadonlyArray<A>, AppError | PromptCancelled> => {
    const behavior = recordCall(method, config);
    const options = Array.isArray(config.options)
      ? config.options
      : typeof config.options === "function"
        ? resolveAutocompleteOptions(config.options)
        : config.options;

    if (behavior.type === "cancel") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    if (behavior.type === "return") {
      return resolveOptionValuesByMatch(options, behavior.value, method);
    }
    if (behavior.type === "multiselect") {
      return resolveOptionValues(options, behavior.indices, method);
    }
    return dieInvalidBehavior(method, "expected a multiselect behavior");
  };

  const runGroupMultiselectPrompt = <A>(
    method: InputMethod,
    config: GroupMultiselectConfig<A>,
  ): Effect.Effect<ReadonlyArray<A>, AppError | PromptCancelled> => {
    const behavior = recordCall(method, config);
    const options = flattenGroupedOptions(config.options);

    if (behavior.type === "cancel") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    if (behavior.type === "return") {
      return resolveOptionValuesByMatch(options, behavior.value, method);
    }
    if (behavior.type === "multiselect") {
      return resolveOptionValues(options, behavior.indices, method);
    }
    return dieInvalidBehavior(method, "expected a multiselect behavior");
  };

  const layer = Layer.succeed(Input, {
    text: (config) => runStringPrompt("text", config),
    password: (config) => runStringPrompt("password", config),
    confirm: (config) => runBooleanPrompt("confirm", config),
    select: (config) => runSelectPrompt("select", config),
    multiselect: (config) => runMultiselectPrompt("multiselect", config),
    groupMultiselect: (config) => runGroupMultiselectPrompt("groupMultiselect", config),
    selectKey: (config) => runSelectKeyPrompt("selectKey", config),
    autocomplete: (config) => runSelectPrompt("autocomplete", config),
    autocompleteMultiselect: (config) => runMultiselectPrompt("autocompleteMultiselect", config),
    path: (config) => runStringPrompt("path", config),
  });

  return [layer, mock] as const;
};
