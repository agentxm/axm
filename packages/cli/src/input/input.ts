import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";
import type { AppError } from "../app-error/index.js";
import type { PromptCancelled } from "../prompt-cancelled.js";

export interface InputOption<Value> {
  readonly value: Value;
  readonly label?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

export interface TextConfig {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

export interface PasswordConfig {
  readonly message: string;
  readonly mask?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
  readonly clearOnError?: boolean;
}

export interface ConfirmConfig {
  readonly message: string;
  readonly active?: string;
  readonly inactive?: string;
  readonly initialValue?: boolean;
  readonly vertical?: boolean;
}

export interface PathConfig {
  readonly message: string;
  readonly root?: string;
  readonly directory?: boolean;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

export interface SelectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>>;
  readonly initialValue?: V;
  readonly maxItems?: number;
}

export interface MultiselectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly maxItems?: number;
  readonly required?: boolean;
  readonly cursorAt?: V;
}

export interface GroupMultiselectConfig<V> {
  readonly message: string;
  readonly options: Record<string, ReadonlyArray<InputOption<V>>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
  readonly cursorAt?: V;
  readonly selectableGroups?: boolean;
  readonly groupSpacing?: number;
}

export interface SelectKeyConfig<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>>;
  readonly initialValue?: V;
  readonly caseSensitive?: boolean;
}

export interface AutocompleteConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>> | (() => ReadonlyArray<InputOption<V>>);
  readonly maxItems?: number;
  readonly placeholder?: string;
  readonly validate?: (value: V | ReadonlyArray<V> | undefined) => string | Error | undefined;
  readonly filter?: (search: string, option: InputOption<V>) => boolean;
  readonly initialValue?: V;
  readonly initialUserInput?: string;
}

export interface AutocompleteMultiselectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<InputOption<V>> | (() => ReadonlyArray<InputOption<V>>);
  readonly maxItems?: number;
  readonly placeholder?: string;
  readonly validate?: (value: V | ReadonlyArray<V> | undefined) => string | Error | undefined;
  readonly filter?: (search: string, option: InputOption<V>) => boolean;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
}

export class Input extends ServiceMap.Service<
  Input,
  {
    readonly text: (config: TextConfig) => Effect.Effect<string, AppError | PromptCancelled>;
    readonly password: (
      config: PasswordConfig,
    ) => Effect.Effect<string, AppError | PromptCancelled>;
    readonly confirm: (config: ConfirmConfig) => Effect.Effect<boolean, AppError | PromptCancelled>;
    readonly select: <V>(config: SelectConfig<V>) => Effect.Effect<V, AppError | PromptCancelled>;
    readonly multiselect: <V>(
      config: MultiselectConfig<V>,
    ) => Effect.Effect<ReadonlyArray<V>, AppError | PromptCancelled>;
    readonly groupMultiselect: <V>(
      config: GroupMultiselectConfig<V>,
    ) => Effect.Effect<ReadonlyArray<V>, AppError | PromptCancelled>;
    readonly selectKey: <V extends string>(
      config: SelectKeyConfig<V>,
    ) => Effect.Effect<V, AppError | PromptCancelled>;
    readonly autocomplete: <V>(
      config: AutocompleteConfig<V>,
    ) => Effect.Effect<V, AppError | PromptCancelled>;
    readonly autocompleteMultiselect: <V>(
      config: AutocompleteMultiselectConfig<V>,
    ) => Effect.Effect<ReadonlyArray<V>, AppError | PromptCancelled>;
    readonly path: (config: PathConfig) => Effect.Effect<string, AppError | PromptCancelled>;
  }
>()("@axm.sh/cli/Input") {}
