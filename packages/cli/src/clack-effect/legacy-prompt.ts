import * as Context from "effect/Context";
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

export class Confirm extends Context.Tag("@axm.sh/cli/clack-effect/Confirm")<
  Confirm,
  {
    readonly prompt: (config: ConfirmConfig) => Effect.Effect<boolean, PromptError>;
  }
>() {}

export interface SelectConfig<T> {
  readonly message: string;
  readonly items: ReadonlyArray<T>;
  readonly toOption: (item: T) => {
    readonly label: string;
    readonly hint?: string | Option.Option<string>;
  };
}

export class Select extends Context.Tag("@axm.sh/cli/clack-effect/Select")<
  Select,
  {
    readonly prompt: <T>(config: SelectConfig<T>) => Effect.Effect<T, PromptError>;
  }
>() {}

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

export class Multiselect extends Context.Tag("@axm.sh/cli/clack-effect/Multiselect")<
  Multiselect,
  {
    readonly prompt: <T>(
      config: MultiselectConfig<T>,
    ) => Effect.Effect<ReadonlyArray<T>, PromptError>;
  }
>() {}

export interface TextInputConfig {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly validate?: (value: string) => string | undefined;
}

export class TextInput extends Context.Tag("@axm.sh/cli/clack-effect/TextInput")<
  TextInput,
  {
    readonly prompt: (config: TextInputConfig) => Effect.Effect<string, PromptError>;
  }
>() {}

export interface PasswordInputConfig {
  readonly message: string;
  readonly mask?: string;
}

export class PasswordInput extends Context.Tag("@axm.sh/cli/clack-effect/PasswordInput")<
  PasswordInput,
  {
    readonly prompt: (config: PasswordInputConfig) => Effect.Effect<string, PromptError>;
  }
>() {}

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

const makeLegacyPromptServices = (prompt: Context.Tag.Service<typeof ClackPrompt>) => {
  const confirm: Context.Tag.Service<typeof Confirm> = {
    prompt: (config) =>
      prompt.confirm({
        message: config.message,
        ...(config.initialValue !== undefined && { initialValue: config.initialValue }),
      }),
  };

  const select: Context.Tag.Service<typeof Select> = {
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

  const multiselect: Context.Tag.Service<typeof Multiselect> = {
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

  const textInput: Context.Tag.Service<typeof TextInput> = {
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

  const passwordInput: Context.Tag.Service<typeof PasswordInput> = {
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
> = Layer.effectContext(
  Effect.map(ClackPrompt, (prompt) => {
    const { confirm, select, multiselect, textInput, passwordInput } =
      makeLegacyPromptServices(prompt);
    return Context.empty().pipe(
      Context.add(Confirm, confirm),
      Context.add(Select, select),
      Context.add(Multiselect, multiselect),
      Context.add(TextInput, textInput),
      Context.add(PasswordInput, passwordInput),
    );
  }),
);
