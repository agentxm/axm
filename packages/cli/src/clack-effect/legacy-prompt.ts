import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { PromptCancelled } from "../prompt-cancelled.js";
import type { CliError } from "../cli-error/index.js";
import { ClackPrompt } from "./prompt/service.js";

type PromptError = CliError | PromptCancelled;

export interface ConfirmConfig {
  readonly message: string;
  readonly initialValue?: boolean;
}

export class Confirm extends ServiceMap.Service<
  Confirm,
  {
    readonly prompt: (config: ConfirmConfig) => Effect.Effect<boolean, PromptError>;
  }
>()("@axm.sh/cli/clack-effect/Confirm") {}

export interface SelectConfig<T> {
  readonly message: string;
  readonly items: ReadonlyArray<T>;
  readonly toOption: (item: T) => {
    readonly label: string;
    readonly hint?: string | Option.Option<string>;
  };
}

export class Select extends ServiceMap.Service<
  Select,
  {
    readonly prompt: <T>(config: SelectConfig<T>) => Effect.Effect<T, PromptError>;
  }
>()("@axm.sh/cli/clack-effect/Select") {}

export interface MultiselectConfig<T> {
  readonly message: string;
  readonly items: ReadonlyArray<T>;
  readonly toOption: (item: T) => {
    readonly value: string;
    readonly label: string;
    readonly hint?: string | Option.Option<string>;
  };
  readonly initialValues?: Option.Option<ReadonlyArray<T>>;
  readonly required?: Option.Option<boolean>;
}

export class Multiselect extends ServiceMap.Service<
  Multiselect,
  {
    readonly prompt: <T>(
      config: MultiselectConfig<T>,
    ) => Effect.Effect<ReadonlyArray<T>, PromptError>;
  }
>()("@axm.sh/cli/clack-effect/Multiselect") {}

export interface TextInputConfig {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly validate?: (value: string) => string | undefined;
}

export class TextInput extends ServiceMap.Service<
  TextInput,
  {
    readonly prompt: (config: TextInputConfig) => Effect.Effect<string, PromptError>;
  }
>()("@axm.sh/cli/clack-effect/TextInput") {}

export interface PasswordInputConfig {
  readonly message: string;
  readonly mask?: string;
}

export class PasswordInput extends ServiceMap.Service<
  PasswordInput,
  {
    readonly prompt: (config: PasswordInputConfig) => Effect.Effect<string, PromptError>;
  }
>()("@axm.sh/cli/clack-effect/PasswordInput") {}

const toOptional = <T>(value: T | Option.Option<T> | undefined): T | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (Option.isOption(value)) {
    return Option.getOrUndefined(value);
  }
  return value;
};

const toHint = (hint: string | Option.Option<string> | undefined): string | undefined =>
  toOptional(hint);

const makeLegacyPromptServices = (prompt: ServiceMap.Service.Shape<typeof ClackPrompt>) => {
  const confirm: ServiceMap.Service.Shape<typeof Confirm> = {
    prompt: (config) =>
      prompt.confirm({
        message: config.message,
        ...(config.initialValue !== undefined && { initialValue: config.initialValue }),
      }),
  };

  const select: ServiceMap.Service.Shape<typeof Select> = {
    prompt: (config) =>
      prompt.select({
        message: config.message,
        options: config.items.map((item) => {
          const option = config.toOption(item);
          const hint = toHint(option.hint);
          return {
            value: item,
            label: option.label,
            ...(hint !== undefined && { hint }),
          };
        }),
      }),
  };

  const multiselect: ServiceMap.Service.Shape<typeof Multiselect> = {
    prompt: (config) => {
      const initialValues = toOptional(config.initialValues);
      const required = toOptional(config.required);
      return prompt.multiselect({
        message: config.message,
        options: config.items.map((item) => {
          const option = config.toOption(item);
          const hint = toHint(option.hint);
          return {
            value: item,
            label: option.label,
            ...(hint !== undefined && { hint }),
          };
        }),
        ...(initialValues !== undefined ? { initialValues } : {}),
        ...(required !== undefined ? { required } : {}),
      });
    },
  };

  const textInput: ServiceMap.Service.Shape<typeof TextInput> = {
    prompt: (config) =>
      prompt.text({
        message: config.message,
        ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
        ...(config.defaultValue !== undefined && { defaultValue: config.defaultValue }),
        ...(config.validate !== undefined && {
          validate: (value: string | undefined) =>
            value === undefined ? undefined : config.validate?.(value),
        }),
      }),
  };

  const passwordInput: ServiceMap.Service.Shape<typeof PasswordInput> = {
    prompt: (config) =>
      prompt.password({
        message: config.message,
        ...(config.mask !== undefined && { mask: config.mask }),
      }),
  };

  return {
    confirm,
    select,
    multiselect,
    textInput,
    passwordInput,
  };
};

export const LegacyPromptLive: Layer.Layer<
  Confirm | Select | Multiselect | TextInput | PasswordInput,
  never,
  ClackPrompt
> = Layer.effectServices(
  Effect.map(ClackPrompt.asEffect(), (prompt) => {
    const { confirm, select, multiselect, textInput, passwordInput } =
      makeLegacyPromptServices(prompt);
    return ServiceMap.empty().pipe(
      ServiceMap.add(Confirm, confirm),
      ServiceMap.add(Select, select),
      ServiceMap.add(Multiselect, multiselect),
      ServiceMap.add(TextInput, textInput),
      ServiceMap.add(PasswordInput, passwordInput),
    );
  }),
);
