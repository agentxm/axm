import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";
import type { AppError } from "../app-error/index.js";
import type { PromptCancelled } from "./prompt-cancelled.js";

export interface PromptOption<Value> {
  readonly value: Value;
  readonly label?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

export interface TextOpts {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

export interface PasswordOpts {
  readonly message: string;
  readonly mask?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
  readonly clearOnError?: boolean;
}

export interface ConfirmOpts {
  readonly message: string;
  readonly active?: string;
  readonly inactive?: string;
  readonly initialValue?: boolean;
  readonly vertical?: boolean;
}

export interface PathOpts {
  readonly message: string;
  readonly root?: string;
  readonly directory?: boolean;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

export interface SelectOpts<V> {
  readonly message: string;
  readonly options: ReadonlyArray<PromptOption<V>>;
  readonly initialValue?: V;
  readonly maxItems?: number;
}

export interface MultiselectOpts<V> {
  readonly message: string;
  readonly options: ReadonlyArray<PromptOption<V>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly maxItems?: number;
  readonly required?: boolean;
  readonly cursorAt?: V;
}

export interface GroupMultiselectOpts<V> {
  readonly message: string;
  readonly options: Record<string, ReadonlyArray<PromptOption<V>>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
  readonly cursorAt?: V;
  readonly selectableGroups?: boolean;
  readonly groupSpacing?: number;
}

export interface SelectKeyOpts<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<PromptOption<V>>;
  readonly initialValue?: V;
  readonly caseSensitive?: boolean;
}

export interface AutocompleteOpts<V> {
  readonly message: string;
  readonly options: ReadonlyArray<PromptOption<V>> | (() => ReadonlyArray<PromptOption<V>>);
  readonly maxItems?: number;
  readonly placeholder?: string;
  readonly validate?: (value: V | ReadonlyArray<V> | undefined) => string | Error | undefined;
  readonly filter?: (search: string, option: PromptOption<V>) => boolean;
  readonly initialValue?: V;
  readonly initialUserInput?: string;
}

export interface AutocompleteMultiselectOpts<V> {
  readonly message: string;
  readonly options: ReadonlyArray<PromptOption<V>> | (() => ReadonlyArray<PromptOption<V>>);
  readonly maxItems?: number;
  readonly placeholder?: string;
  readonly validate?: (value: V | ReadonlyArray<V> | undefined) => string | Error | undefined;
  readonly filter?: (search: string, option: PromptOption<V>) => boolean;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
}

export class CliPrompt extends ServiceMap.Service<
  CliPrompt,
  {
    readonly text: (opts: TextOpts) => Effect.Effect<string, PromptCancelled | AppError>;
    readonly password: (opts: PasswordOpts) => Effect.Effect<string, PromptCancelled | AppError>;
    readonly confirm: (opts: ConfirmOpts) => Effect.Effect<boolean, PromptCancelled | AppError>;
    readonly select: <V>(opts: SelectOpts<V>) => Effect.Effect<V, PromptCancelled | AppError>;
    readonly multiselect: <V>(
      opts: MultiselectOpts<V>,
    ) => Effect.Effect<ReadonlyArray<V>, PromptCancelled | AppError>;
    readonly groupMultiselect: <V>(
      opts: GroupMultiselectOpts<V>,
    ) => Effect.Effect<ReadonlyArray<V>, PromptCancelled | AppError>;
    readonly selectKey: <V extends string>(
      opts: SelectKeyOpts<V>,
    ) => Effect.Effect<V, PromptCancelled | AppError>;
    readonly autocomplete: <V>(
      opts: AutocompleteOpts<V>,
    ) => Effect.Effect<V, PromptCancelled | AppError>;
    readonly autocompleteMultiselect: <V>(
      opts: AutocompleteMultiselectOpts<V>,
    ) => Effect.Effect<ReadonlyArray<V>, PromptCancelled | AppError>;
    readonly path: (opts: PathOpts) => Effect.Effect<string, PromptCancelled | AppError>;
  }
>()("@axm.sh/cli/CliPrompt") {}
