/**
 * Fully qualified name (FQN) parsing and formatting for 3-segment extension names.
 *
 * FQN format: `@owner/type-plural/name` (e.g., `@acme/skills/code-review`)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import { parseFullyQualifiedNameParts, type FullyQualifiedNameParts } from "./common.js";

/**
 * Parsed fully qualified name.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Fqn = FullyQualifiedNameParts;

/**
 * Parse a 3-segment FQN string into its parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFqn = (input: string) =>
  Effect.gen(function* () {
    const parsed = parseFullyQualifiedNameParts(input);
    if (parsed === undefined) {
      return yield* makeAppError({
        code: "INVALID_FQN",
        what: `Invalid fully qualified name: ${input}`,
        details: ["Expected format: @handle/type/name (e.g., @acme/skills/code-review)"],
        howToFix:
          "Use the 3-segment format: @handle/(skills|commands|mcp-servers|subagents|files|rules|packs)/name",
      });
    }
    return parsed;
  });

/**
 * Parse a 3-segment FQN string into its parts. Throws on invalid input.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFqnOrThrow = (input: string): Fqn => {
  const parsed = parseFullyQualifiedNameParts(input);
  if (parsed === undefined) {
    throw new Error(
      `Invalid fully qualified name: ${input}. Expected format: @handle/(skills|commands|mcp-servers|subagents|files|rules|packs)/name`,
    );
  }
  return parsed;
};

/**
 * Format a parsed FQN back into a string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatFqn = (fqn: Fqn): string => `${fqn.owner}/${fqn.type}/${fqn.name}`;
