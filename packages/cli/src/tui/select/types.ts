import type * as Option from "effect/Option";

export interface SelectOption {
  readonly label: string;
  readonly hint: Option.Option<string>;
}

export interface SelectConfig<T> {
  readonly message: string;
  readonly items: readonly T[];
  readonly toOption: (item: T) => SelectOption;
}
