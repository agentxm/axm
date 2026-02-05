/**
 * Error types for well-known discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";

/**
 * Base error union for well-known discovery errors.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WellKnownError =
  | WellKnownFetchError
  | WellKnownNotFoundError
  | WellKnownInvalidIndexError;

/**
 * Network error during well-known discovery.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WellKnownFetchError extends Data.TaggedError("WellKnownFetchError")<{
  readonly message: string;
  readonly url: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

/**
 * Well-known endpoint not found (404).
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WellKnownNotFoundError extends Data.TaggedError("WellKnownNotFoundError")<{
  readonly message: string;
  readonly url: string;
}> {}

/**
 * Malformed or invalid index JSON.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WellKnownInvalidIndexError extends Data.TaggedError("WellKnownInvalidIndexError")<{
  readonly message: string;
  readonly url: string;
  readonly cause?: unknown;
}> {}
