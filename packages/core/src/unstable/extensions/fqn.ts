/**
 * Fully qualified name (FQN) parsing and formatting for 3-segment extension names.
 *
 * FQN format: `@owner/type-plural/name` (e.g., `@acme/skills/code-review`)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";

/**
 * Extension type in plural form, matching the FQN segment.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionTypePlural = "skills" | "packs" | "commands" | "mcp-servers";

/**
 * Parsed fully qualified name.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Fqn {
  readonly owner: string;
  readonly type: ExtensionTypePlural;
  readonly name: string;
}

const FQN_PARTS_PATTERN = /^(@[\w-]+)\/(skills|packs|commands|mcp-servers)\/([\w-]+)$/;

const parseFqnMatch = (input: string): Fqn | undefined => {
  const match = FQN_PARTS_PATTERN.exec(input);
  if (!match) {
    return undefined;
  }

  const owner = match.at(1);
  const type = match.at(2);
  const name = match.at(3);

  if (
    owner === undefined ||
    name === undefined ||
    (type !== "skills" && type !== "packs" && type !== "commands" && type !== "mcp-servers")
  ) {
    return undefined;
  }

  return {
    owner,
    type,
    name,
  };
};

/**
 * Parse a 3-segment FQN string into its parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFqn = (input: string) =>
  Effect.gen(function* () {
    const parsed = parseFqnMatch(input);
    if (parsed === undefined) {
      return yield* makeAppError({
        code: "INVALID_FQN",
        what: `Invalid fully qualified name: ${input}`,
        details: ["Expected format: @handle/type/name (e.g., @acme/skills/code-review)"],
        howToFix: "Use the 3-segment format: @handle/(skills|packs|mcp-servers)/name",
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
  const parsed = parseFqnMatch(input);
  if (parsed === undefined) {
    throw new Error(
      `Invalid fully qualified name: ${input}. Expected format: @handle/(skills|packs|mcp-servers)/name`,
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
