/**
 * Shared types for clack-effect service.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Option for select/multiselect prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PromptOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

/**
 * Configuration for multiselect prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface MultiselectConfig<T> {
  readonly toOption: (item: T) => PromptOption;
  readonly initialValues?: readonly string[];
  readonly required?: boolean;
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
