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
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

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
// Input Pattern Types (v2)
// -----------------------------------------------------------------------------

/** A simple name with no `/`, `@`, or URL scheme. */
type NameInput = { readonly _tag: "NameInput"; readonly name: string };

/** A scoped registry source: `@scope/name`. */
type RegistrySourceInput = {
  readonly _tag: "RegistrySourceInput";
  readonly scope: string;
  readonly name: string;
};

/** A valid URL (validated via `Schema.URL`). */
type UrlInput = { readonly _tag: "UrlInput"; readonly url: URL };

/** An SCP-style git address: `user@host:path` (e.g. `git@github.com:owner/repo.git`). */
type ScpAddress = { readonly _tag: "ScpAddress"; readonly input: string };

/** An `owner/repo` style pattern containing `/` (not a URL or file path). */
type SlashPattern = { readonly _tag: "SlashPattern"; readonly input: string };

/** A local filesystem path matching `LOCAL_PATH_PATTERN`. */
type FilePathPattern = { readonly _tag: "FilePathPattern"; readonly path: string };

/** Discriminated union of all input patterns recognized by the v2 parser. */
export type InputPattern =
  | NameInput
  | RegistrySourceInput
  | UrlInput
  | ScpAddress
  | SlashPattern
  | FilePathPattern;

const REGISTRY_SOURCE_PATTERN = /^@([^/]+)\/(.+)$/;

/** SCP-style: `user@host:path` — no `://` scheme. */
const SCP_PATTERN = /^[^@]+@[^:]+:.+$/;

/** Simple name: alphanumeric with hyphens, no leading/trailing hyphen. */
const NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

/**
 * Classify an input string into an InputPattern.
 *
 * Pure function — no effects, no trimming. Returns `None` for empty/whitespace-only input.
 */
export const parseInputPattern = (input: string): Option.Option<InputPattern> => {
  if (!input || !input.trim()) return Option.none();

  // 1. SCP-style git address (user@host:path) — must check before URL
  if (SCP_PATTERN.test(input)) {
    return Option.some({ _tag: "ScpAddress", input });
  }

  // 2. URL (validated via Schema.URL)
  const urlOption = Schema.decodeUnknownOption(Schema.URL)(input);
  if (Option.isSome(urlOption)) {
    return Option.some({ _tag: "UrlInput", url: urlOption.value });
  }

  // 3. Registry source (@scope/name)
  const registryMatch = input.match(REGISTRY_SOURCE_PATTERN);
  if (registryMatch && registryMatch[1] && registryMatch[2]) {
    return Option.some({
      _tag: "RegistrySourceInput",
      scope: registryMatch[1],
      name: registryMatch[2],
    });
  }

  // 4. File path
  if (LOCAL_PATH_PATTERN.test(input)) {
    return Option.some({ _tag: "FilePathPattern", path: input });
  }

  // 5. Slash pattern (exactly two valid-name segments: `owner/repo`)
  if (input.includes("/")) {
    const segments = input.split("/");
    if (segments.length === 2 && segments.every((s) => NAME_PATTERN.test(s))) {
      return Option.some({ _tag: "SlashPattern", input });
    }
    return Option.none();
  }

  // 6. Simple name (alphanumeric with hyphens, no leading/trailing hyphen)
  if (NAME_PATTERN.test(input)) {
    return Option.some({ _tag: "NameInput", name: input });
  }

  return Option.none();
};

// -----------------------------------------------------------------------------
// v2 Parser
// -----------------------------------------------------------------------------

/**
 * Parse a source string into a ParsedSource (v2).
 *
 * Currently stubs all branches with ParseError — individual pattern handlers
 * will be wired in follow-up work.
 */
export const parseSourceV2 = (input: string): Effect.Effect<ParsedSource<Source>, ParseError> => {
  const trimmed = input.trim();

  if (!trimmed) {
    return Effect.fail(new ParseError({ message: "Source string cannot be empty", input }));
  }

  const patternOption = parseInputPattern(trimmed);

  if (Option.isNone(patternOption)) {
    return Effect.fail(new ParseError({ message: "Unable to parse source", input: trimmed }));
  }

  const pattern = patternOption.value;

  switch (pattern._tag) {
    case "NameInput":
      return Effect.fail(
        new ParseError({ message: "Name input is not yet supported", input: trimmed }),
      );
    case "RegistrySourceInput":
      return Effect.fail(
        new ParseError({ message: "Registry source input is not yet supported", input: trimmed }),
      );
    case "ScpAddress":
      return Effect.fail(
        new ParseError({
          message: "SCP-style git addresses are not yet supported",
          input: trimmed,
        }),
      );
    case "UrlInput":
      switch (pattern.url.hostname) {
        case "github.com":
          return parseGitHubHttpsUrl(trimmed);
        case "gitlab.com":
          return parseGitLabHttpsUrl(trimmed);
        case "bitbucket.org":
          return parseBitbucketHttpsUrl(trimmed);
        default:
          return Effect.fail(
            new ParseError({
              message: `Unsupported URL host: "${pattern.url.hostname}"`,
              input: trimmed,
            }),
          );
      }
    case "SlashPattern":
      return Effect.fail(
        new ParseError({ message: "Slash pattern is not yet supported", input: trimmed }),
      );
    case "FilePathPattern":
      return Effect.fail(
        new ParseError({ message: "File path pattern is not yet supported", input: trimmed }),
      );
  }
};

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
