/**
 * Shared naming utilities for scoped extension names (`@scope/name`).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeCliError } from "../../cli-error/index.js";

/**
 * Parse `@scope/name` into its parts. Fails with `CliError` on invalid input.
 */
export const parseScopedName = (input: string) => {
  const slashIdx = input.indexOf("/");
  if (slashIdx < 1) {
    return Effect.fail(
      makeCliError({
        code: "INVALID_SCOPED_NAME",
        what: `Expected scoped name (@scope/name), got: ${input}`,
      }),
    );
  }
  return Effect.succeed({
    scope: input.slice(0, slashIdx),
    name: input.slice(slashIdx + 1),
  });
};

/**
 * Parse `@scope/name` into its parts. Throws on invalid input.
 */
export const parseScopedNameOrThrow = (
  input: string,
): { readonly scope: string; readonly name: string } => {
  const slashIdx = input.indexOf("/");
  if (slashIdx < 1) {
    throw new Error(`Expected scoped name (@scope/name), got: ${input}`);
  }
  return {
    scope: input.slice(0, slashIdx),
    name: input.slice(slashIdx + 1),
  };
};

/**
 * Determine whether the name already contains a scope (`@scope/name`).
 */
export const hasScopePrefix = (name: string): boolean => name.startsWith("@") && name.includes("/");
