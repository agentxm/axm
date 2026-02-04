/**
 * Resolution error types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";

/**
 * Error codes for resolution failures.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ResolutionErrorCode = "NOT_FOUND" | "AMBIGUOUS" | "INVALID_INPUT" | "NETWORK_ERROR";

/**
 * Error thrown when extension resolution fails.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class ResolutionError extends Data.TaggedError("ResolutionError")<{
  readonly code: ResolutionErrorCode;
  readonly message: string;
  readonly input: string;
  readonly suggestions?: readonly string[];
}> {}
