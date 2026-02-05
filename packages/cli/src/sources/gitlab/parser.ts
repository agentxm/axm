/**
 * GitLab source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";
import type { ParsedSource } from "../types.js";
import { buildGitSource } from "../utils.js";
import { GITLAB_HTTPS_PATTERN, GITLAB_SSH_PATTERN } from "./patterns.js";

/**
 * Parse a GitLab HTTPS URL.
 */
export const parseGitLabHttpsUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(GITLAB_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitLab URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];
  const ref = match[3];
  const path = match[4];

  return Effect.succeed(buildGitSource("gitlab", input, owner, repo, ref, path));
};

/**
 * Parse a GitLab SSH URL.
 */
export const parseGitLabSshUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(GITLAB_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitLab SSH URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];

  return Effect.succeed(buildGitSource("gitlab", input, owner, repo));
};
