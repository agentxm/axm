/**
 * Source string parser for skills.
 *
 * Parses various source formats (GitHub shorthand, URLs)
 * into a normalized ParsedSource structure.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ParsedSource } from "./types.js";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error thrown when source string parsing fails.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
  readonly input: string;
}> {}

/**
 * Error when a clone URL cannot be built for a source type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class CloneUrlError extends Data.TaggedError("CloneUrlError")<{
  readonly message: string;
  readonly sourceType: string;
}> {}

// -----------------------------------------------------------------------------
// Regex Patterns
// -----------------------------------------------------------------------------

/**
 * GitHub HTTPS URL pattern.
 * Matches: https://github.com/owner/repo[/tree/ref/path]
 */
const GITHUB_HTTPS_PATTERN =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;

/**
 * GitLab HTTPS URL pattern.
 * Matches: https://gitlab.com/owner/repo[/-/tree/ref/path]
 */
const GITLAB_HTTPS_PATTERN =
  /^https?:\/\/gitlab\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/-\/tree\/([^/]+)(?:\/(.+))?)?$/;

/**
 * GitHub SSH URL pattern.
 * Matches: git@github.com:owner/repo.git
 */
const GITHUB_SSH_PATTERN = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;

/**
 * GitLab SSH URL pattern.
 * Matches: git@gitlab.com:owner/repo.git
 */
const GITLAB_SSH_PATTERN = /^git@gitlab\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;

/**
 * Bitbucket HTTPS URL pattern.
 * Matches: https://bitbucket.org/owner/repo[/src/ref/path]
 */
const BITBUCKET_HTTPS_PATTERN =
  /^https?:\/\/bitbucket\.org\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/src\/([^/]+)(?:\/(.+))?)?$/;

/**
 * Bitbucket SSH URL pattern.
 * Matches: git@bitbucket.org:owner/repo.git
 */
const BITBUCKET_SSH_PATTERN = /^git@bitbucket\.org:([^/]+)\/([^/]+?)(?:\.git)?$/;

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

/**
 * URL pattern for detecting HTTPS URLs.
 */
const URL_PATTERN = /^https?:\/\/.+/;

/**
 * Local path pattern for recognizing local filesystem paths.
 * Matches: ./path, ../path, /path, ~/path, ~\path, or Windows paths like C:\path or C:/path
 */
const LOCAL_PATH_PATTERN = /^(?:\.\.?\/|\/|~\/|~\\|[A-Za-z]:[\\/])/;

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Build a ParsedSource for local paths.
 */
const buildLocalSource = (original: string, path: string): ParsedSource => ({
  type: "local",
  original,
  canonical: `local:${path}`,
  owner: Option.none(),
  repo: Option.none(),
  ref: Option.none(),
  path: Option.none(),
  url: Option.none(),
  localPath: Option.some(path),
  baseUrl: Option.none(),
});

/**
 * Build a ParsedSource for well-known HTTP(S) sources.
 */
const buildWellKnownSource = (original: string, baseUrl: string): ParsedSource => ({
  type: "wellknown",
  original,
  canonical: `wellknown:${baseUrl}`,
  owner: Option.none(),
  repo: Option.none(),
  ref: Option.none(),
  path: Option.none(),
  url: Option.none(),
  localPath: Option.none(),
  baseUrl: Option.some(baseUrl),
});

/**
 * Build a ParsedSource for GitHub/GitLab/Bitbucket sources.
 */
const buildGitSource = (
  type: "github" | "gitlab" | "bitbucket",
  original: string,
  owner: string,
  repo: string,
  ref?: string,
  path?: string,
): ParsedSource => ({
  type,
  original,
  canonical: `${type}:${owner}/${repo}`,
  owner: Option.some(owner),
  repo: Option.some(repo),
  ref: Option.fromNullable(ref),
  path: Option.fromNullable(path),
  url: Option.none(),
  localPath: Option.none(),
  baseUrl: Option.none(),
});

// -----------------------------------------------------------------------------
// Parser Functions
// -----------------------------------------------------------------------------

/**
 * Parse a GitHub HTTPS URL.
 */
const parseGitHubHttpsUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(GITHUB_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];
  const ref = match[3];
  const path = match[4];

  return Effect.succeed(buildGitSource("github", input, owner, repo, ref, path));
};

/**
 * Parse a GitLab HTTPS URL.
 */
const parseGitLabHttpsUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
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
 * Parse a GitHub SSH URL.
 */
const parseGitHubSshUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(GITHUB_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub SSH URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];

  return Effect.succeed(buildGitSource("github", input, owner, repo));
};

/**
 * Parse a GitLab SSH URL.
 */
const parseGitLabSshUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(GITLAB_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitLab SSH URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];

  return Effect.succeed(buildGitSource("gitlab", input, owner, repo));
};

/**
 * Parse a Bitbucket HTTPS URL.
 */
const parseBitbucketHttpsUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
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
const parseBitbucketSshUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(BITBUCKET_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid Bitbucket SSH URL format", input }));
  }

  const owner = match[1];
  const repo = match[2];

  return Effect.succeed(buildGitSource("bitbucket", input, owner, repo));
};

/**
 * Parse a prefixed shorthand (github:owner/repo, gitlab:owner/repo, or bitbucket:owner/repo).
 */
const parsePrefixedShorthand = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(PREFIXED_SHORTHAND_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return Effect.fail(new ParseError({ message: "Invalid prefixed shorthand format", input }));
  }

  const prefix = match[1] as "github" | "gitlab" | "bitbucket";
  const owner = match[2];
  const repo = match[3];
  const path = match[4];
  const ref = match[5];

  return Effect.succeed(buildGitSource(prefix, input, owner, repo, ref, path));
};

/**
 * Parse a local filesystem path.
 */
const parseLocalPath = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  return Effect.succeed(buildLocalSource(input, input));
};

/**
 * Parse GitHub shorthand (owner/repo[/path][@ref]).
 * Defaults to GitHub when no prefix is specified.
 */
const parseShorthand = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(SHORTHAND_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid shorthand format", input }));
  }

  const owner = match[1];
  const repo = match[2];
  const path = match[3];
  const ref = match[4];

  return Effect.succeed(buildGitSource("github", input, owner, repo, ref, path));
};

// -----------------------------------------------------------------------------
// URL Builders
// -----------------------------------------------------------------------------

/**
 * Build a git clone URL from a parsed source.
 *
 * Only works for GitHub, GitLab, and Bitbucket sources. Returns CloneUrlError for other types.
 *
 * @experimental This API is unstable and may change without notice.
 * @param parsed - The parsed source to build a clone URL for
 * @returns Effect containing the HTTPS clone URL or CloneUrlError
 */
export const buildCloneUrl = (parsed: ParsedSource): Effect.Effect<string, CloneUrlError> => {
  const owner = Option.getOrElse(parsed.owner, () => "");
  const repo = Option.getOrElse(parsed.repo, () => "");
  if (parsed.type === "github") {
    return Effect.succeed(`https://github.com/${owner}/${repo}.git`);
  }
  if (parsed.type === "gitlab") {
    return Effect.succeed(`https://gitlab.com/${owner}/${repo}.git`);
  }
  if (parsed.type === "bitbucket") {
    return Effect.succeed(`https://bitbucket.org/${owner}/${repo}.git`);
  }
  return Effect.fail(
    new CloneUrlError({
      message: `Cannot build clone URL for source type: ${parsed.type}`,
      sourceType: parsed.type,
    }),
  );
};

/**
 * Get the origin URL from a parsed source.
 *
 * Returns the human-readable URL or path for the source.
 * - For GitHub: https://github.com/owner/repo
 * - For GitLab: https://gitlab.com/owner/repo
 * - For Bitbucket: https://bitbucket.org/owner/repo
 * - For git/registry: the original string
 *
 * @experimental This API is unstable and may change without notice.
 * @param parsed - The parsed source to get the origin from
 * @returns The origin URL or path
 */
export const getOriginFromParsed = (parsed: ParsedSource): string => {
  const owner = Option.getOrElse(parsed.owner, () => "");
  const repo = Option.getOrElse(parsed.repo, () => "");
  switch (parsed.type) {
    case "github":
      return `https://github.com/${owner}/${repo}`;
    case "gitlab":
      return `https://gitlab.com/${owner}/${repo}`;
    case "bitbucket":
      return `https://bitbucket.org/${owner}/${repo}`;
    case "local":
      return parsed.original;
    case "wellknown":
      return Option.getOrElse(parsed.baseUrl, () => parsed.original);
    case "git":
    case "registry":
      return parsed.original;
  }
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
export const parseSource = (input: string): Effect.Effect<ParsedSource, ParseError> => {
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

  // Check for other HTTPS URLs - use well-known discovery
  if (URL_PATTERN.test(trimmed)) {
    return Effect.succeed(buildWellKnownSource(trimmed, trimmed));
  }

  // Check for local paths (now supported)
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
