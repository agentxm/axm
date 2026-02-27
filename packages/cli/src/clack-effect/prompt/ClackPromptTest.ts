import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { PromptCancelled } from "../../prompt-cancelled.js";
import { Confirm, Multiselect, PasswordInput, Select, TextInput } from "../legacy-prompt.js";
import { ClackPrompt } from "./service.js";

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
  readonly methodBehaviors?: Partial<Record<ClackPromptMethod, LegacyPromptBehavior>>;
  readonly queuedBehaviors?: ReadonlyArray<ClackPromptBehavior>;
  readonly queuedBehaviorsByMethod?: Partial<
    Record<ClackPromptMethod, ReadonlyArray<ClackPromptBehavior>>
  >;
}

export interface ClackPromptCall {
  readonly method: ClackPromptMethod;
  readonly config: unknown;
}

export interface MockClackPromptService {
  readonly calls: Array<ClackPromptCall>;
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

export class ClackPromptTest extends Context.Tag("@axm.sh/cli/test/ClackPromptTest")<
  ClackPromptTest,
  {
    readonly ref: Ref.Ref<ReadonlyArray<ClackPromptCall>>;
    readonly get: Effect.Effect<ReadonlyArray<ClackPromptCall>>;
  }
>() {}

export function makeClackPromptTestLayer(
  configOrBehavior: LegacyPromptBehavior | ClackPromptTestLayerConfig = defaultBehavior,
): readonly [
  Layer.Layer<
    ClackPrompt | ClackPromptTest | Confirm | Select | Multiselect | TextInput | PasswordInput
  >,
  MockClackPromptService,
] {
  const mock: MockClackPromptService = { calls: [] };

  const resolvedConfig: ClackPromptTestLayerConfig = isBehavior(configOrBehavior)
    ? { defaultBehavior: normalizeBehavior(configOrBehavior) }
    : configOrBehavior;

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

    const methodBehavior = resolvedConfig.methodBehaviors?.[method];
    return methodBehavior
      ? normalizeBehavior(methodBehavior)
      : (resolvedConfig.defaultBehavior ?? defaultBehavior);
  };

  const layer = Layer.effectContext(
    Effect.gen(function* () {
      const ref = yield* Ref.make<ReadonlyArray<ClackPromptCall>>([]);

      const runPrompt = <A>(
        method: ClackPromptMethod,
        config: unknown,
      ): Effect.Effect<A, PromptCancelled> =>
        Effect.sync(() => {
          mock.calls.push({ method, config });
        }).pipe(
          Effect.zipRight(Ref.update(ref, (calls) => [...calls, { method, config }])),
          Effect.map(() => resolveBehavior(method)),
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

      const promptService: Context.Tag.Service<typeof ClackPrompt> = {
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

      const confirmService: Context.Tag.Service<typeof Confirm> = {
        prompt: (config) => runPrompt<boolean>("confirm", config),
      };

      const selectService: Context.Tag.Service<typeof Select> = {
        prompt: (config) =>
          runPrompt("select", {
            message: config.message,
            options: config.items.map((item) => ({ value: item })),
          }),
      };

      const multiselectService: Context.Tag.Service<typeof Multiselect> = {
        prompt: (config) =>
          runPrompt("multiselect", {
            message: config.message,
            options: config.items.map((item) => ({ value: item })),
          }),
      };

      const textInputService: Context.Tag.Service<typeof TextInput> = {
        prompt: (config) => runPrompt<string>("text", config),
      };

      const passwordInputService: Context.Tag.Service<typeof PasswordInput> = {
        prompt: (config) => runPrompt<string>("password", config),
      };

      const test: Context.Tag.Service<typeof ClackPromptTest> = {
        ref,
        get: Ref.get(ref),
      };

      return Context.empty().pipe(
        Context.add(ClackPrompt, promptService),
        Context.add(ClackPromptTest, test),
        Context.add(Confirm, confirmService),
        Context.add(Select, selectService),
        Context.add(Multiselect, multiselectService),
        Context.add(TextInput, textInputService),
        Context.add(PasswordInput, passwordInputService),
      );
    }),
  );

  return [layer, mock] as const;
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
