import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../prompt-cancelled.js";
import type { AppError } from "../app-error/index.js";
import { Input } from "./input.js";

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

const isOptionConfig = (
  config: unknown,
): config is { options: ReadonlyArray<{ value: unknown }> } =>
  typeof config === "object" && config !== null && "options" in config;

const erasePromptType = <T>(value: unknown): T => {
  // Assertion needed: the test harness returns caller-chosen prompt value types.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return value as T;
};

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

  const runPrompt = <A>(
    method: InputMethod,
    config: unknown,
  ): Effect.Effect<A, AppError | PromptCancelled> => {
    mock.calls.push({ method, config });
    const behavior = resolveBehavior(method);

    if (behavior.type === "cancel") {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    if (behavior.type === "return") {
      return Effect.succeed(erasePromptType<A>(behavior.value));
    }
    if (behavior.type === "select") {
      if (!isOptionConfig(config)) {
        return Effect.die(
          new Error(`Test setup error: method ${method} does not provide selectable options`),
        );
      }
      const option = config.options[behavior.index];
      if (!option) {
        return Effect.die(
          new Error(`Test setup error: index ${String(behavior.index)} out of bounds`),
        );
      }
      return Effect.succeed(erasePromptType<A>(option.value));
    }
    // multiselect
    if (!isOptionConfig(config)) {
      return Effect.die(
        new Error(`Test setup error: method ${method} does not provide selectable options`),
      );
    }
    return Effect.succeed(
      erasePromptType<A>(
        behavior.indices.map((index) => {
          const option = config.options[index];
          if (!option) {
            throw new Error(`Test setup error: index ${String(index)} out of bounds`);
          }
          return option.value;
        }),
      ),
    );
  };

  const layer = Layer.succeed(Input, {
    text: (config) => runPrompt<string>("text", config),
    password: (config) => runPrompt<string>("password", config),
    confirm: (config) => runPrompt<boolean>("confirm", config),
    select: (config) => runPrompt("select", config),
    multiselect: (config) => runPrompt("multiselect", config),
    groupMultiselect: (config) => runPrompt("groupMultiselect", config),
    selectKey: (config) => runPrompt("selectKey", config),
    autocomplete: (config) => runPrompt("autocomplete", config),
    autocompleteMultiselect: (config) => runPrompt("autocompleteMultiselect", config),
    path: (config) => runPrompt<string>("path", config),
  });

  return [layer, mock] as const;
};
