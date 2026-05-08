/**
 * Shared helper for parsing provider shorthand patterns.
 *
 * Parses the `owner/repo[/path][@ref]` portion (after stripping the prefix)
 * into constituent parts.
 *
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import type { AppError } from "../../app-error/index.js";
import { makeAppError } from "../../app-error/index.js";
import {
  GitHostedSourceParamPartsSchema,
  type GitHostedSourceParamParts,
} from "../../sources/types.js";

/** Matches: owner/repo[/path][@ref] */
const PROVIDER_SHORTHAND_PATTERN = /^([^/@]+)\/([^/@]+)(?:\/([^@]+))?(?:@(.+))?$/;

const decodeGitHostedSourceParamParts = Schema.decodeUnknownResult(GitHostedSourceParamPartsSchema);

/**
 * Parse the body of a provider shorthand (the part after the `prefix:` prefix).
 *
 * Returns `{ owner, repo, subPath?, ref? }` or fails with AppError.
 */
export const parseProviderShorthand = (
  input: string,
  _original: string,
): Effect.Effect<GitHostedSourceParamParts, AppError> =>
  Effect.gen(function* () {
    const match = input.match(PROVIDER_SHORTHAND_PATTERN);
    if (!match || !match[1] || !match[2]) {
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid shorthand format",
      });
    }

    const decoded = decodeGitHostedSourceParamParts({
      owner: match[1],
      repo: match[2],
      ...(match[3] === undefined ? {} : { subPath: match[3] }),
      ...(match[4] === undefined ? {} : { ref: match[4] }),
    });

    if (Result.isFailure(decoded)) {
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid shorthand format",
      });
    }

    return decoded.success;
  });
