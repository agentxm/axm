/**
 * Generic YAML frontmatter parser.
 *
 * Parses content that may begin with a YAML frontmatter block delimited
 * by `---`. Returns the parsed frontmatter as `unknown` so each consumer
 * can apply its own Schema validation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import YAML, { YAMLParseError } from "yaml";
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

/** Bounded, document-relative failure from parsing a YAML frontmatter block. */
export class FrontmatterParseFailure extends Data.TaggedError("FrontmatterParseFailure")<{
  readonly reason: string;
  readonly line?: number;
  readonly column?: number;
}> {}

const FRONTMATTER_DELIMITER = "---";
const FRONTMATTER_PARSE_FALLBACK_REASON = "YAML frontmatter could not be parsed";
const FRONTMATTER_PARSE_REASON_MAX_CODE_POINTS = 256;

const boundedReason = (reason: string): string => {
  const codePoints = Array.from(reason);
  if (codePoints.length <= FRONTMATTER_PARSE_REASON_MAX_CODE_POINTS) return reason;
  return `${codePoints.slice(0, FRONTMATTER_PARSE_REASON_MAX_CODE_POINTS - 1).join("")}…`;
};

const parserReason = (error: YAMLParseError): string => {
  const firstLine = error.message.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const withoutLocation = firstLine
    .replace(/\s+at line \d+, column \d+:?$/, "")
    .replace(/^Missing closing ["']quote$/, "Missing closing quote")
    .trim();
  return boundedReason(withoutLocation || FRONTMATTER_PARSE_FALLBACK_REASON);
};

/** Normalize a foreign YAML failure without retaining its raw cause or parser code. */
export const normalizeFrontmatterParseFailure = (
  error: unknown,
  documentLineOffset: number,
): FrontmatterParseFailure => {
  if (!(error instanceof YAMLParseError)) {
    return new FrontmatterParseFailure({ reason: FRONTMATTER_PARSE_FALLBACK_REASON });
  }
  const position = error.linePos?.[0];
  if (position === undefined || !Number.isSafeInteger(position.line) || position.line < 1) {
    return new FrontmatterParseFailure({ reason: parserReason(error) });
  }
  const line = position.line + documentLineOffset;
  const column = Number.isSafeInteger(position.col) && position.col > 0 ? position.col : undefined;
  return new FrontmatterParseFailure({
    reason: parserReason(error),
    line,
    ...(column === undefined ? {} : { column }),
  });
};

/** Preserve the former CLI-facing validation error at higher-level boundaries. */
export const frontmatterParseFailureToAppError = (cause: FrontmatterParseFailure): AppError =>
  makeAppError({
    code: "validation",
    detail: FRONTMATTER_PARSE_FALLBACK_REASON,
    suggestions: [
      {
        description: "Ensure the frontmatter block contains valid YAML between --- delimiters.",
      },
    ],
    cause,
  });

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
  const bodyStart = content.startsWith("\r\n", closingEnd)
    ? closingEnd + 2
    : content[closingEnd] === "\n"
      ? closingEnd + 1
      : closingEnd;

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
  const frontmatter: unknown = (() => {
    try {
      return YAML.parse(yamlContent ?? "");
    } catch (error) {
      const documentLineOffset = content.slice(0, boundaries.yamlStart).split("\n").length - 1;
      throw normalizeFrontmatterParseFailure(error, documentLineOffset);
    }
  })();
  const body = content.slice(boundaries.bodyStart);

  return { frontmatter: frontmatter ?? undefined, body };
};

/**
 * Parse frontmatter from content as an Effect.
 *
 * Returns `FrontmatterParseFailure` in the error channel for malformed YAML.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFrontmatterEffect = (
  content: string,
): Effect.Effect<FrontmatterResult, FrontmatterParseFailure> =>
  Effect.try({
    try: () => parseFrontmatterSync(content),
    catch: (error) =>
      error instanceof FrontmatterParseFailure
        ? error
        : new FrontmatterParseFailure({ reason: FRONTMATTER_PARSE_FALLBACK_REASON }),
  });
