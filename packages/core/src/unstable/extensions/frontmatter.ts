/**
 * Generic YAML frontmatter parser.
 *
 * Parses content that may begin with a YAML frontmatter block delimited
 * by `---`. Returns the parsed frontmatter as `unknown` so each consumer
 * can apply its own Schema validation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import YAML from "yaml";
import { makeAppError, type AppError } from "../app-error/index.js";

/**
 * Result of parsing frontmatter from content.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FrontmatterResult {
  /** Parsed YAML frontmatter, or undefined if no frontmatter block was found. */
  readonly frontmatter: unknown;
  /** Content body after the frontmatter block, or full content if no frontmatter. */
  readonly body: string;
}

const FRONTMATTER_DELIMITER = "---";

/**
 * Find the frontmatter boundaries in content.
 * Returns [endOfOpening, startOfClosing] indices, or undefined if no frontmatter.
 */
const findFrontmatterBoundaries = (
  content: string,
): { yamlStart: number; bodyStart: number } | undefined => {
  if (!content.startsWith(FRONTMATTER_DELIMITER)) {
    return undefined;
  }

  const afterOpening = content.indexOf("\n");
  if (afterOpening === -1) {
    return undefined;
  }

  const closingIndex = content.indexOf(`\n${FRONTMATTER_DELIMITER}`, afterOpening);
  if (closingIndex === -1) {
    return undefined;
  }

  const closingEnd = closingIndex + 1 + FRONTMATTER_DELIMITER.length;
  const bodyStart = content[closingEnd] === "\n" ? closingEnd + 1 : closingEnd;

  return {
    yamlStart: afterOpening + 1,
    bodyStart,
  };
};

/**
 * Parse frontmatter from content synchronously.
 *
 * Throws on malformed YAML. Use `parseFrontmatterEffect` for full error channel.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFrontmatterSync = (content: string): FrontmatterResult => {
  const boundaries = findFrontmatterBoundaries(content);
  if (boundaries === undefined) {
    return { frontmatter: undefined, body: content };
  }

  const yamlContent = content.slice(boundaries.yamlStart, boundaries.bodyStart).split("---")[0];
  const frontmatter: unknown = YAML.parse(yamlContent ?? "");
  const body = content.slice(boundaries.bodyStart);

  return { frontmatter: frontmatter ?? undefined, body };
};

/**
 * Parse frontmatter from content as an Effect.
 *
 * Returns `AppError` in the error channel for malformed YAML.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFrontmatterEffect = (
  content: string,
): Effect.Effect<FrontmatterResult, AppError> =>
  Effect.try({
    try: () => parseFrontmatterSync(content),
    catch: (error) =>
      makeAppError({
        code: "FRONTMATTER_PARSE_ERROR",
        what: "Failed to parse YAML frontmatter",
        details: [error instanceof Error ? error.message : String(error)],
        howToFix: "Ensure the frontmatter block contains valid YAML between --- delimiters.",
        cause: error,
      }),
  });
