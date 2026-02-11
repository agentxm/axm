/**
 * Source resolution: combines parsed input with matching source config.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as azurerepos from "./azurerepos/index.js";
import * as bitbucket from "./bitbucket/index.js";
import { ParseError } from "./errors.js";
import * as github from "./github/index.js";
import * as gitlab from "./gitlab/index.js";
import { parseSourceInput, parseInputPattern } from "./parser.js";
import type { ParseSourceInputResult, Source, SourceInput, SourceType } from "./types.js";
import type { SourceConfig } from "../settings/schema.js";
import { Workspace } from "../workspace/index.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Source types that require a matching config from workspace. */
const GIT_HOSTING_TYPES = new Set<SourceType>(["github", "gitlab", "bitbucket", "azurerepos"]);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Extract hostname from a URL object.
 */
const hostnameFromUrl = (url: URL): string => url.hostname;

/**
 * Extract hostname from the original input string if it's a URL or SCP address.
 */
const extractInputHostname = (input: string): Option.Option<string> => {
  const pattern = parseInputPattern(input.trim());
  if (Option.isNone(pattern)) return Option.none();
  const p = pattern.value;
  switch (p._tag) {
    case "UrlInput":
      return Option.some(p.url.hostname);
    case "GitScpAddress":
      return Option.some(p.host);
    default:
      return Option.none();
  }
};

/**
 * Find matching config for a git hosting source type, given the original input
 * and the available configs of that type.
 */
const findConfig = (
  input: string,
  sourceType: SourceType,
  configs: ReadonlyArray<SourceConfig>,
): Effect.Effect<SourceConfig, ParseError> => {
  // Single config fallback
  if (configs.length === 1) {
    return Effect.succeed(configs[0]!);
  }

  // Try hostname matching for URL/SCP inputs
  const inputHostname = extractInputHostname(input);
  if (Option.isSome(inputHostname)) {
    const hostname = inputHostname.value;
    const match = configs.find((c) => {
      if (!("url" in c)) return false;
      return hostnameFromUrl(c.url) === hostname;
    });
    if (match) return Effect.succeed(match);

    const configNames = configs.map((c) => c.name).join(", ");
    return Effect.fail(
      new ParseError({
        message: `No source config matches hostname "${hostname}" for ${sourceType}. Available configs: ${configNames}`,
        input,
      }),
    );
  }

  // Shorthand input: take first config of that type
  const trimmed = input.trim();
  const patternOpt = parseInputPattern(trimmed);
  if (Option.isSome(patternOpt) && patternOpt.value._tag === "ShorthandInput") {
    return Effect.succeed(configs[0]!);
  }

  // Ambiguous: multiple configs and can't disambiguate
  const configNames = configs.map((c) => c.name).join(", ");
  return Effect.fail(
    new ParseError({
      message: `Ambiguous source: multiple configs for ${sourceType}. Use a URL or config name prefix to disambiguate. Available: ${configNames}`,
      input,
    }),
  );
};

// -----------------------------------------------------------------------------
// Two-phase parse for config-name prefix
// -----------------------------------------------------------------------------

/**
 * Parse shorthand input using the provider for the given source type.
 */
const parseShorthandForSource = (sourceType: string, input: string) => {
  switch (sourceType) {
    case "github":
      return github.parseShorthand(input);
    case "gitlab":
      return gitlab.parseShorthand(input);
    case "bitbucket":
      return bitbucket.parseShorthand(input);
    default:
      return Effect.fail(
        new ParseError({
          message: `Source type "${sourceType}" does not support shorthand syntax`,
          input,
        }),
      );
  }
};

/**
 * Rewrite a URL by substituting the canonical hostname, then parse with the provider.
 */
const rewriteUrl = (sourceType: string, url: URL): Effect.Effect<SourceInput, ParseError> => {
  const canonicalUrl = new URL(url.href);
  switch (sourceType) {
    case "github":
      canonicalUrl.hostname = github.CANONICAL_HOSTNAME;
      return github.parseUrl(canonicalUrl);
    case "gitlab":
      canonicalUrl.hostname = gitlab.CANONICAL_HOSTNAME;
      return gitlab.parseUrl(canonicalUrl);
    case "bitbucket":
      canonicalUrl.hostname = bitbucket.CANONICAL_HOSTNAME;
      return bitbucket.parseUrl(canonicalUrl);
    case "azurerepos":
      canonicalUrl.hostname = azurerepos.CANONICAL_HOSTNAME;
      return azurerepos.parseUrl(canonicalUrl);
    default:
      return Effect.fail(
        new ParseError({ message: `Unknown source type "${sourceType}"`, input: url.href }),
      );
  }
};

/**
 * Rewrite an SCP address by substituting the canonical hostname, then parse with the provider.
 */
const rewriteScp = (
  sourceType: string,
  scp: { user: string; host: string; path: string },
): Effect.Effect<SourceInput, ParseError> => {
  switch (sourceType) {
    case "github":
      return github.parseScp(`${scp.user}@${github.CANONICAL_HOSTNAME}:${scp.path}`);
    case "gitlab":
      return gitlab.parseScp(`${scp.user}@${gitlab.CANONICAL_HOSTNAME}:${scp.path}`);
    case "bitbucket":
      return bitbucket.parseScp(`${scp.user}@${bitbucket.CANONICAL_HOSTNAME}:${scp.path}`);
    case "azurerepos":
      return azurerepos.parseScp(`${scp.user}@${azurerepos.CANONICAL_HOSTNAME}:${scp.path}`);
    default:
      return Effect.fail(
        new ParseError({
          message: `Unknown source type "${sourceType}"`,
          input: `${scp.user}@${scp.host}:${scp.path}`,
        }),
      );
  }
};

/**
 * When `parseSourceInput` fails, check if the prefix before `:` matches
 * a config name from workspace. If so, re-parse using that config's source
 * type shorthand parser.
 *
 * E.g., `ghe:owner/repo` where `ghe` is a config name for GitHub.
 */
const tryConfigNameParse = (input: string, originalError: ParseError) =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0) {
      return yield* Effect.fail(originalError);
    }

    const prefix = trimmed.slice(0, colonIndex);
    const remainder = trimmed.slice(colonIndex + 1);

    const ws = yield* Workspace;
    const sources = yield* ws
      .getConfiguredSources()
      .pipe(
        Effect.mapError(
          (e) => new ParseError({ message: `Failed to get configured sources: ${e._tag}`, input }),
        ),
      );

    // Find config by name
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (!matchedConfig) {
      return yield* Effect.fail(originalError);
    }

    // Must be a git hosting type with a shorthand
    if (!GIT_HOSTING_TYPES.has(matchedConfig.source as SourceType)) {
      return yield* Effect.fail(originalError);
    }

    const reparsed = `${matchedConfig.source}:${remainder}`;
    const parsedInput = yield* parseShorthandForSource(matchedConfig.source, reparsed);
    return {
      input: parsedInput,
      config: Option.some(matchedConfig),
    } satisfies ParseSourceInputResult;
  });

// -----------------------------------------------------------------------------
// URL hostname matching against workspace config
// -----------------------------------------------------------------------------

/**
 * When `parseSourceInput` fails for a URL with an unknown hostname, try to
 * match the hostname against configured source URLs. If a match is found,
 * re-parse the URL by substituting the canonical hostname so the provider's
 * URL parser accepts it.
 *
 * E.g., `https://github.example.com/owner/repo` with a config
 * `{ name: "ghe", source: "github", url: "https://github.example.com" }`
 * → replace hostname with `github.com` → parse → merge with config.
 */
const tryUrlHostnameMatch = (input: string, originalError: ParseError) =>
  Effect.gen(function* () {
    const trimmed = input.trim();

    // Extract hostname from input — must be a URL or SCP
    const inputHostname = extractInputHostname(trimmed);
    if (Option.isNone(inputHostname)) {
      return yield* Effect.fail(originalError);
    }

    const hostname = inputHostname.value;

    // Get configured sources from workspace
    const ws = yield* Workspace;
    const sources = yield* ws
      .getConfiguredSources()
      .pipe(
        Effect.mapError(
          (e) => new ParseError({ message: `Failed to get configured sources: ${e._tag}`, input }),
        ),
      );

    // Find a config whose URL hostname matches the input hostname
    const matchingConfig = sources.find((c) => {
      if (!("url" in c)) return false;
      return hostnameFromUrl(c.url) === hostname;
    });

    if (!matchingConfig) {
      return yield* Effect.fail(originalError);
    }

    // Substitute the canonical hostname and re-parse with the provider's parser
    const pattern = parseInputPattern(trimmed);
    if (Option.isNone(pattern)) {
      return yield* Effect.fail(originalError);
    }

    const p = pattern.value;
    if (p._tag === "UrlInput") {
      const parsedInput = yield* rewriteUrl(matchingConfig.source, p.url).pipe(
        Effect.mapError(() => originalError),
      );
      return {
        input: parsedInput,
        config: Option.some(matchingConfig),
      } satisfies ParseSourceInputResult;
    }

    if (p._tag === "GitScpAddress") {
      const parsedInput = yield* rewriteScp(matchingConfig.source, p).pipe(
        Effect.mapError(() => originalError),
      );
      return {
        input: parsedInput,
        config: Option.some(matchingConfig),
      } satisfies ParseSourceInputResult;
    }

    return yield* Effect.fail(originalError);
  });

// -----------------------------------------------------------------------------
// Main resolver
// -----------------------------------------------------------------------------

/**
 * Resolve a source input string into a fully resolved Source.
 *
 * Combines the parsed input coordinates from `parseSourceInput` with
 * the matching source config from the Workspace service.
 *
 * For self-describing sources (local, git, registry) the input passes through
 * as-is. For git hosting types (github, gitlab, bitbucket, azurerepos) the
 * input is merged with the matching SourceConfig.
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The source string to resolve
 * @returns Effect containing a resolved Source or ParseError
 */
export const resolveSource = (input: string) =>
  Effect.gen(function* () {
    // Try standard parse, with fallback to config-name or URL hostname matching
    const parseResult = yield* parseSourceInput(input).pipe(
      Effect.catchTag("ParseError", (error) => tryConfigNameParse(input, error)),
      Effect.catchTag("ParseError", (error) => tryUrlHostnameMatch(input, error)),
    );

    const { input: sourceInput, config: explicitConfig } = parseResult;

    // Self-describing types pass through without config
    if (!GIT_HOSTING_TYPES.has(sourceInput.source)) {
      return sourceInput as Source;
    }

    // If config was explicitly determined by two-phase parse, merge directly
    if (Option.isSome(explicitConfig)) {
      return { ...sourceInput, ...explicitConfig.value } as Source;
    }

    // Get configured sources for config matching
    const ws = yield* Workspace;
    const allSources = yield* ws
      .getConfiguredSources()
      .pipe(
        Effect.mapError(
          (e) => new ParseError({ message: `Failed to get configured sources: ${e._tag}`, input }),
        ),
      );

    // Filter to configs of the same source type
    const configs = allSources.filter((c) => c.source === sourceInput.source);

    if (configs.length === 0) {
      return yield* new ParseError({
        message: `No source config found for source type "${sourceInput.source}". Add a source config via settings.`,
        input,
      });
    }

    // Find the matching config
    const matchedConfig = yield* findConfig(input, sourceInput.source, configs);

    // Merge input + config
    return { ...sourceInput, ...matchedConfig } as Source;
  });
