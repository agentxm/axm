/**
 * Source resolution: combines parsed input with matching source config.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { descriptor as azurereposDescriptor } from "./azurerepos/index.js";
import { descriptor as bitbucketDescriptor } from "./bitbucket/index.js";
import { ParseError } from "./errors.js";
import { descriptor as githubDescriptor } from "./github/index.js";
import { descriptor as gitlabDescriptor } from "./gitlab/index.js";
import { determineSourceInput, parseInputPattern } from "./parser.js";
import type { Source, SourceDescriptor, SourceInput, SourceType } from "./types.js";
import type { SourceConfig } from "../settings/schema.js";
import { Workspace } from "../workspace/index.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Source types that require a matching config from workspace. */
const GIT_HOSTING_TYPES = new Set<SourceType>(["github", "gitlab", "bitbucket", "azurerepos"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySourceDescriptor = SourceDescriptor<any, any>;

/** Map from source type id to its descriptor. */
const DESCRIPTOR_BY_TYPE = new Map<string, AnySourceDescriptor>([
  ["github", githubDescriptor],
  ["gitlab", gitlabDescriptor],
  ["bitbucket", bitbucketDescriptor],
  ["azurerepos", azurereposDescriptor],
]);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Extract hostname from a URL string.
 */
const hostnameFromUrl = (url: string): Option.Option<string> => {
  try {
    return Option.some(new URL(url).hostname);
  } catch {
    return Option.none();
  }
};

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
      const configHostname = hostnameFromUrl(c.url);
      return Option.isSome(configHostname) && configHostname.value === hostname;
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
 * When `determineSourceInput` fails, check if the prefix before `:` matches
 * a config name from workspace. If so, re-parse using that config's source
 * type descriptor shorthand.
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
    const sources = yield* ws.getConfiguredSources().pipe(
      Effect.mapError(
        (e) => new ParseError({ message: `Failed to get configured sources: ${e._tag}`, input }),
      ),
    );

    // Find config by name
    const config = sources.find((s) => s.name === prefix);
    if (!config) {
      return yield* Effect.fail(originalError);
    }

    // Must be a git hosting type with a shorthand descriptor
    if (!GIT_HOSTING_TYPES.has(config.source as SourceType)) {
      return yield* Effect.fail(originalError);
    }

    const desc = DESCRIPTOR_BY_TYPE.get(config.source);
    if (!desc || Option.isNone(desc.shorthand)) {
      return yield* Effect.fail(
        new ParseError({
          message: `Source type "${config.source}" does not support shorthand syntax`,
          input,
        }),
      );
    }

    // Re-parse: construct `{sourceType}:{remainder}` and parse with the descriptor
    const reparsed = `${config.source}:${remainder}`;
    const sourceInput = yield* desc.shorthand.value.parse(reparsed);

    return {
      sourceInput: sourceInput as SourceInput,
      explicitConfig: Option.some(config),
    };
  });

// -----------------------------------------------------------------------------
// Main resolver
// -----------------------------------------------------------------------------

/**
 * Resolve a source input string into a fully resolved Source.
 *
 * Combines the parsed input coordinates from `determineSourceInput` with
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
    // Try standard parse, with fallback to config-name two-phase parse
    const parseResult = yield* determineSourceInput(input).pipe(
      Effect.map((si) => ({
        sourceInput: si,
        explicitConfig: Option.none<SourceConfig>(),
      })),
      Effect.catchTag("ParseError", (error) => tryConfigNameParse(input, error)),
    );

    const { sourceInput, explicitConfig } = parseResult;

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
    const allSources = yield* ws.getConfiguredSources().pipe(
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
    const config = yield* findConfig(input, sourceInput.source, configs);

    // Merge input + config
    return { ...sourceInput, ...config } as Source;
  });
