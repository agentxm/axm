/**
 * GitHub source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";
import { type GitHubSource, type ParsedSource, ParsedSource as PS } from "../types.js";
import { GITHUB_HTTPS_PATTERN, GITHUB_SSH_PATTERN } from "./patterns.js";

/**
 * Parse a GitHub HTTPS URL.
 */
export const parseGitHubHttpsUrl = (
  input: string,
): Effect.Effect<ParsedSource<GitHubSource>, ParseError> => {
  const match = input.match(GITHUB_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];
  const ref = match[3];
  const subPath = match[4];

  return Effect.succeed(PS.GitHub({ original: input, owner, repo, ref, subPath }));
};

/**
 * Parse a GitHub SSH URL.
 */
export const parseGitHubSshUrl = (
  input: string,
): Effect.Effect<ParsedSource<GitHubSource>, ParseError> => {
  const match = input.match(GITHUB_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub SSH URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];

  return Effect.succeed(PS.GitHub({ original: input, owner, repo }));
};
