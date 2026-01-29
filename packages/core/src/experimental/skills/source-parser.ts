/**
 * Source string parser for skills.
 *
 * Parses various source formats (GitHub shorthand, URLs, local paths)
 * into a normalized ParsedSource structure.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { Data, Effect } from "effect";
import type { ParsedSource, SourceType } from "./types.js";

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
 * GitHub/GitLab shorthand pattern.
 * Matches: owner/repo[/path][@ref]
 * Note: Must have exactly 2+ segments separated by / and owner cannot start with . or /
 */
const SHORTHAND_PATTERN = /^([^/@.][^/@]*)\/([^/@]+)(?:\/([^@]+))?(?:@(.+))?$/;

/**
 * Prefixed shorthand pattern.
 * Matches: github:owner/repo[/path][@ref] or gitlab:owner/repo[/path][@ref]
 */
const PREFIXED_SHORTHAND_PATTERN = /^(github|gitlab):([^/@]+)\/([^/@]+)(?:\/([^@]+))?(?:@(.+))?$/;

/**
 * Local path pattern.
 * Matches: ./path, ../path, /path, or Windows paths like C:\path
 */
const LOCAL_PATH_PATTERN = /^(?:\.\.?\/|\/|[A-Za-z]:[\\/])/;

/**
 * Direct URL pattern.
 * Matches: https://example.com/anything (not GitHub/GitLab)
 */
const URL_PATTERN = /^https?:\/\/.+/;

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Build a ParsedSource for GitHub/GitLab sources.
 */
const buildGitSource = (
  type: "github" | "gitlab",
  original: string,
  owner: string,
  repo: string,
  ref?: string,
  path?: string,
): ParsedSource => {
  const canonical = `${type}:${owner}/${repo}`;
  const base: ParsedSource = {
    type,
    original,
    canonical,
    owner,
    repo,
  };

  if (ref) {
    (base as { ref?: string }).ref = ref;
  }
  if (path) {
    (base as { path?: string }).path = path;
  }

  return base;
};

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
 * Parse a prefixed shorthand (github:owner/repo or gitlab:owner/repo).
 */
const parsePrefixedShorthand = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  const match = input.match(PREFIXED_SHORTHAND_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return Effect.fail(new ParseError({ message: "Invalid prefixed shorthand format", input }));
  }

  const prefix = match[1] as "github" | "gitlab";
  const owner = match[2];
  const repo = match[3];
  const path = match[4];
  const ref = match[5];

  return Effect.succeed(buildGitSource(prefix, input, owner, repo, ref, path));
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

/**
 * Parse a local path (./relative, /absolute, or Windows path).
 */
const parseLocalPath = (input: string): Effect.Effect<ParsedSource, never> => {
  return Effect.succeed({
    type: "local" as SourceType,
    original: input,
    canonical: input,
  });
};

/**
 * Parse a direct URL (non-GitHub/GitLab HTTPS URL).
 */
const parseDirectUrl = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  // Check if it's a well-known URL (has a host but no file extension suggesting a direct file)
  // Direct URLs typically point to specific files (e.g., .md, .txt)
  // Well-known URLs are base URLs that will be used to fetch /.well-known/skills/index.json
  const url = new URL(input);
  const pathname = url.pathname;

  // If the URL ends with a known file extension, treat as direct-url
  // Otherwise, treat as well-known (will fetch /.well-known/skills/index.json)
  const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(pathname);

  if (hasFileExtension) {
    return Effect.succeed({
      type: "direct-url" as SourceType,
      original: input,
      canonical: input,
      url: input,
    });
  }

  return Effect.succeed({
    type: "well-known" as SourceType,
    original: input,
    canonical: input,
    url: input,
  });
};

// -----------------------------------------------------------------------------
// Main Parser
// -----------------------------------------------------------------------------

/**
 * Parse a source string into a ParsedSource.
 *
 * Supported formats:
 * - GitHub shorthand: `owner/repo`, `owner/repo@ref`, `owner/repo/path`, `owner/repo/path@ref`
 * - Prefixed shorthand: `github:owner/repo`, `gitlab:owner/repo`
 * - GitHub HTTPS: `https://github.com/owner/repo`, `https://github.com/owner/repo/tree/branch/path`
 * - GitLab HTTPS: `https://gitlab.com/owner/repo`, `https://gitlab.com/owner/repo/-/tree/branch/path`
 * - GitHub SSH: `git@github.com:owner/repo.git`
 * - GitLab SSH: `git@gitlab.com:owner/repo.git`
 * - Local paths: `./relative/path`, `/absolute/path`, `C:\windows\path`
 * - Direct URLs: `https://example.com/skill.md`
 * - Well-known: `https://example.com` (will fetch /.well-known/skills/index.json)
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

  // Check for prefixed shorthand first (github:, gitlab:)
  if (trimmed.startsWith("github:") || trimmed.startsWith("gitlab:")) {
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

  // Check for GitHub SSH URL
  if (trimmed.startsWith("git@github.com:")) {
    return parseGitHubSshUrl(trimmed);
  }

  // Check for GitLab SSH URL
  if (trimmed.startsWith("git@gitlab.com:")) {
    return parseGitLabSshUrl(trimmed);
  }

  // Check for local paths
  if (LOCAL_PATH_PATTERN.test(trimmed)) {
    return parseLocalPath(trimmed);
  }

  // Check for other URLs (direct-url or well-known)
  if (URL_PATTERN.test(trimmed)) {
    return Effect.try({
      try: () => new URL(trimmed),
      catch: () => new ParseError({ message: "Invalid URL format", input: trimmed }),
    }).pipe(Effect.flatMap(() => parseDirectUrl(trimmed)));
  }

  // Try to parse as shorthand (owner/repo)
  if (SHORTHAND_PATTERN.test(trimmed)) {
    return parseShorthand(trimmed);
  }

  // Unable to parse
  return Effect.fail(
    new ParseError({
      message: `Unable to parse source: "${trimmed}". Expected GitHub shorthand (owner/repo), URL, or local path.`,
      input: trimmed,
    }),
  );
};
