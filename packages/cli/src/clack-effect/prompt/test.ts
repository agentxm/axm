import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../../prompt-cancelled.js";
import {
  Confirm,
  Multiselect,
  PasswordInput,
  Select,
  TextInput,
  type ConfirmService,
  type MultiselectService,
  type PasswordInputService,
  type SelectService,
  type TextInputService,
} from "../legacy-prompt.js";
import { ClackPrompt, type ClackPromptService } from "./service.js";

const clackPromptMethods = [
  "text",
  "password",
  "confirm",
  "select",
  "multiselect",
  "groupMultiselect",
  "selectKey",
  "autocomplete",
  "autocompleteMultiselect",
  "path",
] as const;

export type ClackPromptMethod = (typeof clackPromptMethods)[number];

export type ClackPromptBehavior =
  | { readonly type: "return"; readonly value: unknown }
  | { readonly type: "cancel" }
  | { readonly type: "select"; readonly index: number }
  | { readonly type: "multiselect"; readonly indices: ReadonlyArray<number> };

export interface ClackPromptTestLayerConfig {
  readonly defaultBehavior?: ClackPromptBehavior;
  readonly methodBehaviors?: Partial<Record<ClackPromptMethod, ClackPromptBehavior>>;
  readonly queuedBehaviors?: ReadonlyArray<ClackPromptBehavior>;
  readonly queuedBehaviorsByMethod?: Partial<
    Record<ClackPromptMethod, ReadonlyArray<ClackPromptBehavior>>
  >;
}

export interface MockClackPromptService extends ClackPromptService {
  readonly calls: { method: ClackPromptMethod; config: unknown }[];
}

export type ConfirmBehavior =
  | { readonly type: "return"; readonly value: boolean }
  | { readonly type: "cancel" };

export type SelectBehavior =
  | { readonly type: "return"; readonly index: number }
  | { readonly type: "select"; readonly index: number }
  | { readonly type: "cancel" };

export type MultiselectBehavior =
  | { readonly type: "return"; readonly indices: ReadonlyArray<number> }
  | { readonly type: "multiselect"; readonly indices: ReadonlyArray<number> }
  | { readonly type: "cancel" };

type LegacyPromptBehavior = ClackPromptBehavior | SelectBehavior | MultiselectBehavior;

const normalizeBehavior = (behavior: LegacyPromptBehavior): ClackPromptBehavior => {
  if (behavior.type === "return" && "index" in behavior) {
    return { type: "select", index: behavior.index };
  }
  if (behavior.type === "return" && "indices" in behavior) {
    return { type: "multiselect", indices: behavior.indices };
  }
  return behavior;
};

const defaultBehavior = { type: "return", value: "" } satisfies ClackPromptBehavior;

const isBehavior = (value: unknown): value is LegacyPromptBehavior =>
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

export function makeClackPromptTestLayer(
  configOrBehavior: LegacyPromptBehavior | ClackPromptTestLayerConfig = defaultBehavior,
): [
  Layer.Layer<ClackPrompt | Confirm | Select | Multiselect | TextInput | PasswordInput>,
  MockClackPromptService,
] {
  const resolvedConfig: ClackPromptTestLayerConfig = isBehavior(configOrBehavior)
    ? { defaultBehavior: normalizeBehavior(configOrBehavior) }
    : configOrBehavior;

  const calls: { method: ClackPromptMethod; config: unknown }[] = [];
  const queuedBehaviors = Array.from(resolvedConfig.queuedBehaviors ?? []);

  const queuedBehaviorsByMethod = Object.fromEntries(
    clackPromptMethods.map((method) => [
      method,
      Array.from(resolvedConfig.queuedBehaviorsByMethod?.[method] ?? []),
    ]),
  ) as Record<ClackPromptMethod, ClackPromptBehavior[]>;

  const resolveBehavior = (method: ClackPromptMethod): ClackPromptBehavior => {
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
    method: ClackPromptMethod,
    config: unknown,
  ): Effect.Effect<A, PromptCancelled> =>
    Effect.sync(() => {
      calls.push({ method, config });
      return resolveBehavior(method);
    }).pipe(
      Effect.flatMap((behavior) =>
        behavior.type === "cancel"
          ? Effect.fail(new PromptCancelled({ message: "Operation cancelled." }))
          : behavior.type === "return"
            ? Effect.succeed(behavior.value as A)
            : behavior.type === "select"
              ? Effect.sync(() => {
                  if (!isOptionConfig(config)) {
                    throw new Error(
                      `Test setup error: method ${method} does not provide selectable options`,
                    );
                  }

                  const option = config.options[behavior.index];
                  if (!option) {
                    throw new Error(
                      `Test setup error: index ${String(behavior.index)} out of bounds`,
                    );
                  }

                  return option.value as A;
                })
              : Effect.sync(() => {
                  if (!isOptionConfig(config)) {
                    throw new Error(
                      `Test setup error: method ${method} does not provide selectable options`,
                    );
                  }

                  return behavior.indices.map((index) => {
                    const option = config.options[index];
                    if (!option) {
                      throw new Error(`Test setup error: index ${String(index)} out of bounds`);
                    }

                    return option.value;
                  }) as A;
                }),
      ),
    );

  const mockService: MockClackPromptService = {
    calls,
    text: (config) => runPrompt<string>("text", config),
    password: (config) => runPrompt<string>("password", config),
    confirm: (config) => runPrompt<boolean>("confirm", config),
    select: <V>(config: unknown) => runPrompt<V>("select", config),
    multiselect: <V>(config: unknown) => runPrompt<ReadonlyArray<V>>("multiselect", config),
    groupMultiselect: <V>(config: unknown) =>
      runPrompt<ReadonlyArray<V>>("groupMultiselect", config),
    selectKey: <V extends string>(config: unknown) => runPrompt<V>("selectKey", config),
    autocomplete: <V>(config: unknown) => runPrompt<V>("autocomplete", config),
    autocompleteMultiselect: <V>(config: unknown) =>
      runPrompt<ReadonlyArray<V>>("autocompleteMultiselect", config),
    path: (config) => runPrompt<string>("path", config),
  };

  const confirmService: ConfirmService = {
    prompt: (config) => runPrompt<boolean>("confirm", config),
  };

  const selectService: SelectService = {
    prompt: (config) =>
      runPrompt("select", {
        message: config.message,
        options: config.items.map((item) => ({ value: item })),
      }),
  };

  const multiselectService: MultiselectService = {
    prompt: (config) =>
      runPrompt("multiselect", {
        message: config.message,
        options: config.items.map((item) => ({ value: item })),
      }),
  };

  const textInputService: TextInputService = {
    prompt: (config) => runPrompt<string>("text", config),
  };

  const passwordInputService: PasswordInputService = {
    prompt: (config) => runPrompt<string>("password", config),
  };

  const layer = Layer.mergeAll(
    Layer.succeed(ClackPrompt, mockService),
    Layer.succeed(Confirm, confirmService),
    Layer.succeed(Select, selectService),
    Layer.succeed(Multiselect, multiselectService),
    Layer.succeed(TextInput, textInputService),
    Layer.succeed(PasswordInput, passwordInputService),
  );
  return [layer, mockService];
}

export const makeConfirmTestLayer = (behavior: ConfirmBehavior = { type: "return", value: true }) =>
  makeClackPromptTestLayer({ methodBehaviors: { confirm: behavior } });

export const makeSelectTestLayer = (behavior: SelectBehavior = { type: "select", index: 0 }) => {
  const normalized: ClackPromptBehavior =
    behavior.type === "return" && "index" in behavior
      ? { type: "select", index: behavior.index }
      : behavior;
  return makeClackPromptTestLayer({ methodBehaviors: { select: normalized } });
};

export const makeMultiselectTestLayer = (
  behavior: MultiselectBehavior = { type: "multiselect", indices: [] },
) => {
  const normalized: ClackPromptBehavior =
    behavior.type === "return" && "indices" in behavior
      ? { type: "multiselect", indices: behavior.indices }
      : behavior;
  return makeClackPromptTestLayer({ methodBehaviors: { multiselect: normalized } });
};
