/**
 * Error types for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";

/**
 * Error thrown when source string parsing fails.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
  readonly input: string;
}> {}

/**
 * Error when a clone URL cannot be built for a source type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class CloneUrlError extends Data.TaggedError("CloneUrlError")<{
  readonly message: string;
  readonly sourceType: string;
}> {}
