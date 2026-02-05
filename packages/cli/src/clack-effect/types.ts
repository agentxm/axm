/**
 * Shared types for clack-effect service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";

/**
 * Option for select/multiselect prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PromptOption {
  readonly value: string;
  readonly label: string;
  readonly hint: Option.Option<string>;
}

/**
 * Configuration for multiselect prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface MultiselectConfig<T> {
  readonly toOption: (item: T) => PromptOption;
  readonly initialValues: Option.Option<readonly string[]>;
  readonly required: Option.Option<boolean>;
}

/**
 * Spinner interface for showing progress.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Spinner {
  readonly start: (message: string) => void;
  readonly stop: (message: string) => void;
}
