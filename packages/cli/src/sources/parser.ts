/**
 * Source string parser for skills.
 *
 * Parses various source formats (GitHub shorthand, URLs)
 * into a normalized ParsedSource structure.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { parseBitbucketHttpsUrl, parseBitbucketSshUrl } from "./bitbucket/index.js";
import { ParseError } from "./errors.js";
import { parseGitHubHttpsUrl, parseGitHubSshUrl } from "./github/index.js";
import { parseGitLabHttpsUrl, parseGitLabSshUrl } from "./gitlab/index.js";
import { LOCAL_PATH_PATTERN, parseLocalPath } from "./local/index.js";
import {
  type GitHubSource,
  type GitHostingProviderSource,
  type ParsedSource,
  ParsedSource as PS,
  type Source,
} from "./types.js";

// -----------------------------------------------------------------------------
// Regex Patterns
// -----------------------------------------------------------------------------

/**
 * GitHub/GitLab shorthand pattern.
 * Matches: owner/repo[/path][@ref]
 * Note: Must have exactly 2+ segments separated by / and owner cannot start with . or /
 */
const SHORTHAND_PATTERN = /^([^/@.][^/@]*)\/([^/@]+)(?:\/([^@]+))?(?:@(.+))?$/;

/**
 * Prefixed shorthand pattern.
 * Matches: github:owner/repo[/path][@ref] or gitlab:owner/repo[/path][@ref] or bitbucket:owner/repo[/path][@ref]
 */
const PREFIXED_SHORTHAND_PATTERN =
  /^(github|gitlab|bitbucket):([^/@]+)\/([^/@]+)(?:\/([^@]+))?(?:@(.+))?$/;

// -----------------------------------------------------------------------------
// Parser Functions
// -----------------------------------------------------------------------------

/**
 * Parse a prefixed shorthand (github:owner/repo, gitlab:owner/repo, or bitbucket:owner/repo).
 */
const parsePrefixedShorthand = (
  input: string,
): Effect.Effect<ParsedSource<GitHostingProviderSource>, ParseError> => {
  const match = input.match(PREFIXED_SHORTHAND_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return Effect.fail(new ParseError({ message: "Invalid prefixed shorthand format", input }));
  }

  const prefix = match[1] as "github" | "gitlab" | "bitbucket";
  const owner = match[2];
  const repo = match[3];
  const subPath = match[4];
  const ref = match[5];

  switch (prefix) {
    case "github":
      return Effect.succeed(PS.GitHub({ original: input, owner, repo, ref, subPath }));
    case "gitlab":
      return Effect.succeed(PS.GitLab({ original: input, owner, repo, ref, subPath }));
    case "bitbucket":
      return Effect.succeed(PS.Bitbucket({ original: input, owner, repo, ref, subPath }));
  }
};

/**
 * Parse GitHub shorthand (owner/repo[/path][@ref]).
 * Defaults to GitHub when no prefix is specified.
 */
const parseShorthand = (input: string): Effect.Effect<ParsedSource<GitHubSource>, ParseError> => {
  const match = input.match(SHORTHAND_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid shorthand format", input }));
  }

  const owner = match[1];
  const repo = match[2];
  const subPath = match[3];
  const ref = match[4];

  return Effect.succeed(PS.GitHub({ original: input, owner, repo, ref, subPath }));
};

// -----------------------------------------------------------------------------
// Main Parser
// -----------------------------------------------------------------------------

/**
 * Parse a source string into a ParsedSource.
 *
 * Supported formats:
 * - GitHub shorthand: `owner/repo`, `owner/repo@ref`, `owner/repo/path`, `owner/repo/path@ref`
 * - Prefixed shorthand: `github:owner/repo`, `gitlab:owner/repo`, `bitbucket:owner/repo`
 * - GitHub HTTPS: `https://github.com/owner/repo`, `https://github.com/owner/repo/tree/branch/path`
 * - GitLab HTTPS: `https://gitlab.com/owner/repo`, `https://gitlab.com/owner/repo/-/tree/branch/path`
 * - Bitbucket HTTPS: `https://bitbucket.org/owner/repo`, `https://bitbucket.org/owner/repo/src/branch/path`
 * - GitHub SSH: `git@github.com:owner/repo.git`
 * - GitLab SSH: `git@gitlab.com:owner/repo.git`
 * - Bitbucket SSH: `git@bitbucket.org:owner/repo.git`
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The source string to parse
 * @returns Effect containing ParsedSource or ParseError
 */
export const parseSource = (input: string): Effect.Effect<ParsedSource<Source>, ParseError> => {
  // Trim whitespace
  const trimmed = input.trim();

  if (!trimmed) {
    return Effect.fail(new ParseError({ message: "Source string cannot be empty", input }));
  }

  // Check for local: prefix
  if (trimmed.startsWith("local:")) {
    const path = trimmed.slice(6); // Remove "local:" prefix
    return parseLocalPath(path);
  }

  // Check for prefixed shorthand first (github:, gitlab:, bitbucket:)
  if (
    trimmed.startsWith("github:") ||
    trimmed.startsWith("gitlab:") ||
    trimmed.startsWith("bitbucket:")
  ) {
    return parsePrefixedShorthand(trimmed);
  }

  // Check for GitHub HTTPS URL
  if (trimmed.match(/^https?:\/\/github\.com\//)) {
    return parseGitHubHttpsUrl(trimmed);
  }

  // Check for GitLab HTTPS URL
  if (trimmed.match(/^https?:\/\/gitlab\.com\//)) {
    return parseGitLabHttpsUrl(trimmed);
  }

  // Check for Bitbucket HTTPS URL
  if (trimmed.match(/^https?:\/\/bitbucket\.org\//)) {
    return parseBitbucketHttpsUrl(trimmed);
  }

  // Check for GitHub SSH URL
  if (trimmed.startsWith("git@github.com:")) {
    return parseGitHubSshUrl(trimmed);
  }

  // Check for GitLab SSH URL
  if (trimmed.startsWith("git@gitlab.com:")) {
    return parseGitLabSshUrl(trimmed);
  }

  // Check for Bitbucket SSH URL
  if (trimmed.startsWith("git@bitbucket.org:")) {
    return parseBitbucketSshUrl(trimmed);
  }

  // Check for local paths
  if (LOCAL_PATH_PATTERN.test(trimmed)) {
    return parseLocalPath(trimmed);
  }

  // Try to parse as shorthand (owner/repo)
  if (SHORTHAND_PATTERN.test(trimmed)) {
    return parseShorthand(trimmed);
  }

  // Unable to parse
  return Effect.fail(
    new ParseError({
      message: `Unable to parse source: "${trimmed}". Expected GitHub shorthand (owner/repo) or GitHub/GitLab/Bitbucket URL.`,
      input: trimmed,
    }),
  );
};
