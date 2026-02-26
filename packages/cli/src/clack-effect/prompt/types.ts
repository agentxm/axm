export interface ClackOption<Value> {
  readonly value: Value;
  readonly label?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

export interface ClackTextConfig {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

export interface ClackPasswordConfig {
  readonly message: string;
  readonly mask?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
  readonly clearOnError?: boolean;
}

export interface ClackConfirmConfig {
  readonly message: string;
  readonly active?: string;
  readonly inactive?: string;
  readonly initialValue?: boolean;
  readonly vertical?: boolean;
}

export interface ClackPathConfig {
  readonly message: string;
  readonly root?: string;
  readonly directory?: boolean;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

export interface ClackSelectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<ClackOption<V>>;
  readonly initialValue?: V;
  readonly maxItems?: number;
}

export interface ClackMultiselectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<ClackOption<V>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly maxItems?: number;
  readonly required?: boolean;
  readonly cursorAt?: V;
}

export interface ClackGroupMultiselectConfig<V> {
  readonly message: string;
  readonly options: Record<string, ReadonlyArray<ClackOption<V>>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
  readonly cursorAt?: V;
  readonly selectableGroups?: boolean;
  readonly groupSpacing?: number;
}

export interface ClackSelectKeyConfig<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<ClackOption<V>>;
  readonly initialValue?: V;
  readonly caseSensitive?: boolean;
}

export interface ClackAutocompleteConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<ClackOption<V>> | (() => ReadonlyArray<ClackOption<V>>);
  readonly maxItems?: number;
  readonly placeholder?: string;
  readonly validate?: (value: V | ReadonlyArray<V> | undefined) => string | Error | undefined;
  readonly filter?: (search: string, option: ClackOption<V>) => boolean;
  readonly initialValue?: V;
  readonly initialUserInput?: string;
}

export interface ClackAutocompleteMultiselectConfig<V> {
  readonly message: string;
  readonly options: ReadonlyArray<ClackOption<V>> | (() => ReadonlyArray<ClackOption<V>>);
  readonly maxItems?: number;
  readonly placeholder?: string;
  readonly validate?: (value: V | ReadonlyArray<V> | undefined) => string | Error | undefined;
  readonly filter?: (search: string, option: ClackOption<V>) => boolean;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
}
