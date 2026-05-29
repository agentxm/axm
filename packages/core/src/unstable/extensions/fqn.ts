/**
 * Fully qualified name (FQN) parsing and formatting for 3-segment extension names.
 *
 * FQN format: `@owner/type-plural/name` (e.g., `@acme/skills/code-review`)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Result from "effect/Result";
import { makeAppError, type AppError } from "../app-error/index.js";
import { parseExtensionFqnParts, toExtensionTypePlural, type ExtensionFqnParts } from "./common.js";

/**
 * Failure produced when an FQN string does not match the canonical
 * `@owner/type-plural/name` shape.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class FqnInvalidError extends Data.TaggedError("FqnInvalidError")<{
  readonly input: string;
}> {}

/**
 * Parse a 3-segment FQN string into its parts.
 *
 * Pure synchronous validation — yield the Result in `Effect.gen` to bridge
 * failures into the surrounding error channel, or pattern-match on it directly
 * for synchronous callers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFqn = (input: string): Result.Result<ExtensionFqnParts, FqnInvalidError> => {
  const parsed = parseExtensionFqnParts(input);
  return parsed === undefined
    ? Result.fail(new FqnInvalidError({ input }))
    : Result.succeed(parsed);
};

/**
 * Translate a `FqnInvalidError` into a CLI-facing `AppError` with the canonical
 * format suggestion. Use at user-input boundaries (CLI handlers, publish
 * operations) where the parse failure is a user error.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const fqnInvalidErrorToAppError = (error: FqnInvalidError): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid fully qualified name: ${error.input}`,
    suggestions: [
      {
        description:
          "Use the 3-segment format: @handle/(skills|commands|mcps|subagents|docs|rules|packs)/name",
      },
    ],
    cause: error,
  });

/**
 * Parse a schema-validated FQN, throwing as a defect on failure.
 *
 * Use only at call sites where the input has already been validated against
 * an FQN schema (e.g., manifest dependency keys, lockfile resolved maps).
 * A failure here is an invariant violation, not a user error — inside
 * `Effect.gen`, the synchronous throw surfaces as `Cause.Die`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFqnOrThrow = (input: string): ExtensionFqnParts =>
  Result.getOrThrowWith(parseFqn(input), (error) => error);

/**
 * Format a parsed FQN back into a string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatFqn = (fqn: ExtensionFqnParts): string =>
  `${fqn.owner}/${toExtensionTypePlural(fqn.type)}/${fqn.name}`;
