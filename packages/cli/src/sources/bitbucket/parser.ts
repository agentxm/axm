/**
 * Bitbucket source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";
import type { ParsedSource } from "../types.js";
import { buildGitSource } from "../utils.js";
import { BITBUCKET_HTTPS_PATTERN, BITBUCKET_SSH_PATTERN } from "./patterns.js";

/**
 * Parse a Bitbucket HTTPS URL.
 */
export const parseBitbucketHttpsUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(BITBUCKET_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid Bitbucket URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];
  const ref = match[3];
  const path = match[4];

  return Effect.succeed(buildGitSource("bitbucket", input, owner, repo, ref, path));
};

/**
 * Parse a Bitbucket SSH URL.
 */
export const parseBitbucketSshUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(BITBUCKET_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid Bitbucket SSH URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];

  return Effect.succeed(buildGitSource("bitbucket", input, owner, repo));
};
