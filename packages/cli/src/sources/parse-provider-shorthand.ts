/**
 * Shared helper for parsing provider shorthand patterns.
 *
 * Parses the `owner/repo[/path][@ref]` portion (after stripping the prefix)
 * into constituent parts.
 *
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { ParseError } from "./errors.js";

/** Matches: owner/repo[/path][@ref] */
const PROVIDER_SHORTHAND_PATTERN = /^([^/@]+)\/([^/@]+)(?:\/([^@]+))?(?:@(.+))?$/;

/**
 * Parse the body of a provider shorthand (the part after the `prefix:` prefix).
 *
 * Returns `{ owner, repo, subPath?, ref? }` or fails with ParseError.
 */
export const parseProviderShorthand = (input: string, original: string) =>
  Effect.gen(function* () {
    const match = input.match(PROVIDER_SHORTHAND_PATTERN);
    if (!match || !match[1] || !match[2]) {
      return yield* new ParseError({ message: "Invalid shorthand format", input: original });
    }

    return {
      owner: match[1],
      repo: match[2],
      subPath: match[3] as string | undefined,
      ref: match[4] as string | undefined,
    };
  });
