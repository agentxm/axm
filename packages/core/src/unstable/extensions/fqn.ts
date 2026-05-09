/**
 * Fully qualified name (FQN) parsing and formatting for 3-segment extension names.
 *
 * FQN format: `@owner/type-plural/name` (e.g., `@acme/skills/code-review`)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import { parseExtensionFqnParts, toExtensionTypePlural, type ExtensionFqnParts } from "./common.js";

/**
 * Parse a 3-segment FQN string into its parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFqn = (input: string) =>
  Effect.gen(function* () {
    const parsed = parseExtensionFqnParts(input);
    if (parsed === undefined) {
      return yield* makeAppError({
        code: "validation",
        message: `Invalid fully qualified name: ${input}`,
        breadcrumbs: [
          {
            task: "Recover",
            description:
              "Use the 3-segment format: @handle/(skills|commands|mcp-servers|subagents|files|rules|packs)/name",
          },
        ],
      });
    }
    return parsed;
  });

/**
 * Format a parsed FQN back into a string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatFqn = (fqn: ExtensionFqnParts): string =>
  `${fqn.owner}/${toExtensionTypePlural(fqn.type)}/${fqn.name}`;
