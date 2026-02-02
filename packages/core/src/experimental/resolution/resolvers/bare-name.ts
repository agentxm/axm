/**
 * Bare name resolver.
 *
 * Resolves bare names (single identifiers without `/` or `@`) by prepending
 * the configured scope and delegating to the AXM name resolver.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import type { ExtensionRef, ResolutionOptions } from "../types.js";
import { resolveAxmName } from "./axm-name.js";

// -----------------------------------------------------------------------------
// Pattern Detection
// -----------------------------------------------------------------------------

/**
 * Checks if input is a bare name (single identifier, no `/` or `@`).
 *
 * @experimental This API is unstable and may change without notice.
 */
const isBareNamePattern = (input: string): boolean => {
  return !input.includes("/") && !input.includes("@");
};

// -----------------------------------------------------------------------------
// Resolver
// -----------------------------------------------------------------------------

/**
 * Resolves a bare name by prepending the configured scope and delegating to AXM name resolution.
 *
 * A bare name is a single identifier without `/` or `@` (e.g., `grappling-hook`).
 *
 * Behavior:
 * - Returns empty array if input contains `/` or `@` (not a bare name)
 * - Returns empty array if no scope is configured in options
 * - Transforms `name` to `@scope/name` and delegates to resolveAxmName
 * - Preserves version constraint if present: `name@version` to `@scope/name@version`
 *   (Note: bare names by definition don't have `@`, so version isn't preserved in practice)
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The input string to resolve
 * @param options - Resolution options containing scope configuration
 * @returns Effect containing array of resolved extension references
 */
export const resolveBareName = (
  input: string,
  options: ResolutionOptions,
): Effect.Effect<ExtensionRef[], never, FileSystem.FileSystem> => {
  // Not a bare name if it contains / or @
  if (!isBareNamePattern(input)) {
    return Effect.succeed([]);
  }

  // No scope configured - cannot resolve bare name
  if (!options.scope) {
    return Effect.succeed([]);
  }

  // Transform to scoped AXM name: name -> @scope/name
  const scopedName = `@${options.scope}/${input}`;

  // Delegate to AXM name resolver and preserve original bare name input
  return Effect.gen(function* () {
    const results = yield* resolveAxmName(scopedName, options);
    return results.map((ref) => ({
      ...ref,
      originalInput: input,
    }));
  });
};
