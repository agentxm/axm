/**
 * Fully qualified name (FQN) parsing and formatting for 3-segment extension names.
 *
 * FQN format: `@namespace/type-plural/name` (e.g., `@acme/skills/code-review`)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeCliError } from "../cli-error/index.js";

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
  readonly namespace: string;
  readonly type: ExtensionTypePlural;
  readonly name: string;
}

const FQN_PARTS_PATTERN = /^(@[\w-]+)\/(skills|packs|commands|mcp-servers)\/([\w-]+)$/;

/**
 * Parse a 3-segment FQN string into its parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFqn = (input: string) =>
  Effect.gen(function* () {
    const match = FQN_PARTS_PATTERN.exec(input);
    if (!match) {
      return yield* makeCliError({
        code: "INVALID_FQN",
        what: `Invalid fully qualified name: ${input}`,
        details: ["Expected format: @namespace/type/name (e.g., @acme/skills/code-review)"],
        howToFix: "Use the 3-segment format: @namespace/(skills|packs|mcp-servers)/name",
      });
    }

    return {
      namespace: match[1]!,
      type: match[2]! as ExtensionTypePlural,
      name: match[3]!,
    } satisfies Fqn;
  });

/**
 * Parse a 3-segment FQN string into its parts. Throws on invalid input.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFqnOrThrow = (input: string): Fqn => {
  const match = FQN_PARTS_PATTERN.exec(input);
  if (!match) {
    throw new Error(
      `Invalid fully qualified name: ${input}. Expected format: @namespace/(skills|packs|mcp-servers)/name`,
    );
  }

  return {
    namespace: match[1]!,
    type: match[2]! as ExtensionTypePlural,
    name: match[3]!,
  } satisfies Fqn;
};

/**
 * Format a parsed FQN back into a string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatFqn = (fqn: Fqn): string => `${fqn.namespace}/${fqn.type}/${fqn.name}`;
