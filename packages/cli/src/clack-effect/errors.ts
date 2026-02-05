/**
 * Error types for clack-effect service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type * as Option from "effect/Option";

/**
 * Error that occurs during prompt operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class PromptError extends Data.TaggedError("PromptError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

/**
 * Signal that the user cancelled a prompt (Ctrl+C).
 *
 * @experimental This API is unstable and may change without notice.
 */
export class PromptCancelled extends Data.TaggedError("PromptCancelled")<{
  readonly message: string;
}> {}
