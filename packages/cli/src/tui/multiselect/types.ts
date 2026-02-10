import type * as Option from "effect/Option";

export interface MultiselectOption {
  readonly label: string;
  readonly value: string;
  readonly hint: Option.Option<string>;
}

export interface MultiselectConfig<T> {
  readonly message: string;
  readonly items: readonly T[];
  readonly toOption: (item: T) => MultiselectOption;
  readonly initialValues: Option.Option<readonly string[]>;
  readonly required: Option.Option<boolean>;
}
