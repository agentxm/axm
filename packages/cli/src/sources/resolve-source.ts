/**
 * Source resolution: classifies input via parseInputPattern, then routes
 * each pattern type to the appropriate resolution logic.
 *
 * For URL and SCP patterns, resolution iterates configured sources and
 * matches by hostname + provider parse. For other patterns, resolution
 * handles them directly.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";

import * as azurerepos from "./azurerepos/index.js";
import * as bitbucket from "./bitbucket/index.js";
import { ParseError } from "./errors.js";
import * as github from "./github/index.js";
import * as gitlab from "./gitlab/index.js";
import { parseLocalPath } from "./local/index.js";
import { parseInputPattern } from "./parser.js";
import type { Source, SourceInput, SourceType } from "./types.js";
import type { SourceConfig } from "../settings/schema.js";
import type { SkillLockEntry } from "../lockfile/index.js";
import { Workspace } from "../workspace/index.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Source types that require a matching config from workspace. */
const GIT_HOSTING_TYPES = new Set<SourceType>(["github", "gitlab", "bitbucket", "azurerepos"]);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Get configured sources from workspace, mapping errors to ParseError. */
const getConfiguredSources = (input: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    return yield* ws
      .getConfiguredSources()
      .pipe(
        Effect.mapError(
          (e) => new ParseError({ message: `Failed to get configured sources: ${e._tag}`, input }),
        ),
      );
  });

/** Get the relative path of an installed skill from its lockfile entry. */
const getInstalledSkillPath = (name: string, entry: SkillLockEntry): string => {
  if (entry.source === "registry") {
    return `.axm/extensions/${entry.scope}/skills/${name}`;
  }
  return `.agents/skills/${name}`;
};

/** Parse shorthand input using the provider for the given source type. */
const parseShorthandForSource = (
  sourceType: string,
  input: string,
): Effect.Effect<SourceInput, ParseError> => {
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

// -----------------------------------------------------------------------------
// URL routing
// -----------------------------------------------------------------------------

/**
 * Route a URL input by iterating configured sources and matching by
 * hostname + provider parse. First successful match wins.
 */
const routeUrlInput = (url: URL, input: string) =>
  Effect.gen(function* () {
    // Opaque URLs (empty hostname, e.g. "ghe:owner/repo") may be config-name shorthands
    if (!url.hostname) {
      return yield* routeOpaqueUrl(url, input);
    }

    const sources = yield* getConfiguredSources(input);
    const noMatch = new ParseError({
      message: `No configured source matches URL "${url.href}"`,
      input,
    });

    const tryParseUrl = (
      configUrl: URL,
      config: SourceConfig,
      parse: (url: URL, hostname: string) => Effect.Effect<SourceInput, ParseError>,
    ) =>
      configUrl.hostname !== url.hostname
        ? Effect.fail(noMatch)
        : Effect.map(parse(url, configUrl.hostname), (si) => ({ ...si, ...config }) as Source);

    const tryMatch = Match.type<SourceConfig>().pipe(
      Match.when({ source: "github" }, (c) => tryParseUrl(c.url, c, github.parseUrl)),
      Match.when({ source: "gitlab" }, (c) => tryParseUrl(c.url, c, gitlab.parseUrl)),
      Match.when({ source: "bitbucket" }, (c) => tryParseUrl(c.url, c, bitbucket.parseUrl)),
      Match.when({ source: "azurerepos" }, (c) => tryParseUrl(c.url, c, azurerepos.parseUrl)),
      Match.when({ source: "registry" }, () => Effect.fail(noMatch)),
      Match.exhaustive,
    );

    const attempts = Array.map(sources, tryMatch);
    if (Array.isEmptyReadonlyArray(attempts)) {
      return yield* noMatch;
    }

    return yield* Effect.firstSuccessOf(attempts).pipe(
      Effect.mapError(
        () =>
          new ParseError({
            message: `No configured source matches URL "${url.href}"`,
            input,
          }),
      ),
    );
  });

/**
 * Handle opaque URLs (no hostname, e.g. "ghe:owner/repo") by checking if
 * the scheme matches a config name for a git hosting source type.
 */
const routeOpaqueUrl = (url: URL, input: string) =>
  Effect.gen(function* () {
    const colonIndex = input.indexOf(":");
    if (colonIndex <= 0) {
      return yield* new ParseError({ message: "Unable to parse source", input });
    }

    const prefix = input.slice(0, colonIndex);
    const sources = yield* getConfiguredSources(input);

    // Check if the scheme matches a config name
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (matchedConfig && GIT_HOSTING_TYPES.has(matchedConfig.source as SourceType)) {
      const remainder = input.slice(colonIndex + 1);
      const reparsed = `${matchedConfig.source}:${remainder}`;
      const parsedInput = yield* parseShorthandForSource(matchedConfig.source, reparsed);
      return { ...parsedInput, ...matchedConfig } as Source;
    }

    // Not a config name — fail
    return yield* new ParseError({
      message: `No configured source matches URL "${url.href}"`,
      input,
    });
  });

// -----------------------------------------------------------------------------
// SCP routing
// -----------------------------------------------------------------------------

/**
 * Route an SCP address by iterating configured sources and matching by
 * hostname + provider parse. First successful match wins.
 */
const routeScpInput = (
  scp: { readonly user: string; readonly host: string; readonly path: string },
  input: string,
) =>
  Effect.gen(function* () {
    const sources = yield* getConfiguredSources(input);
    const scpInput = `${scp.user}@${scp.host}:${scp.path}`;
    const noMatch = new ParseError({
      message: `No configured source matches SCP address "${scpInput}"`,
      input,
    });

    const tryParseScp = (
      scpHostname: string,
      config: SourceConfig,
      parse: (input: string, hostname: string) => Effect.Effect<SourceInput, ParseError>,
    ) =>
      scp.host !== scpHostname
        ? Effect.fail(noMatch)
        : Effect.map(parse(scpInput, scp.host), (si) => ({ ...si, ...config }) as Source);

    const tryMatch = Match.type<SourceConfig>().pipe(
      Match.when({ source: "github" }, (c) => tryParseScp(c.url.hostname, c, github.parseScp)),
      Match.when({ source: "gitlab" }, (c) => tryParseScp(c.url.hostname, c, gitlab.parseScp)),
      Match.when({ source: "bitbucket" }, (c) =>
        tryParseScp(c.url.hostname, c, bitbucket.parseScp),
      ),
      Match.when({ source: "azurerepos" }, (c) =>
        tryParseScp(`ssh.${c.url.hostname}`, c, azurerepos.parseScp),
      ),
      Match.when({ source: "registry" }, () => Effect.fail(noMatch)),
      Match.exhaustive,
    );

    const attempts = Array.map(sources, tryMatch);
    if (Array.isEmptyReadonlyArray(attempts)) {
      return yield* noMatch;
    }

    return yield* Effect.firstSuccessOf(attempts).pipe(
      Effect.mapError(
        () =>
          new ParseError({
            message: `No configured source matches SCP address "${scpInput}"`,
            input,
          }),
      ),
    );
  });

// -----------------------------------------------------------------------------
// Shorthand routing
// -----------------------------------------------------------------------------

/**
 * Route shorthand input (github:owner/repo, ghe:owner/repo, etc.).
 *
 * Known source-type prefixes dispatch directly to the provider's shorthand
 * parser. Config-name prefixes look up the config and parse using its source
 * type's shorthand parser.
 */
const routeShorthandInput = (prefix: string, shorthandInput: string, input: string) =>
  Effect.gen(function* () {
    const sources = yield* getConfiguredSources(input);

    // Known source-type prefix → dispatch directly, select first config of that type
    const isKnownType = prefix === "github" || prefix === "gitlab" || prefix === "bitbucket";
    if (isKnownType) {
      const parsedInput = yield* parseShorthandForSource(prefix, shorthandInput);
      const config = sources.find((s) => s.source === prefix);
      if (!config) {
        return yield* new ParseError({
          message: `No source config found for source type "${prefix}". Add a source config via settings.`,
          input,
        });
      }
      return { ...parsedInput, ...config } as Source;
    }

    // Config-name prefix → find config, parse with its source type parser
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (!matchedConfig || !GIT_HOSTING_TYPES.has(matchedConfig.source as SourceType)) {
      return yield* new ParseError({
        message: `Unknown shorthand prefix: "${prefix}"`,
        input,
      });
    }

    const remainder = shorthandInput.slice(prefix.length + 1);
    const reparsed = `${matchedConfig.source}:${remainder}`;
    const parsedInput = yield* parseShorthandForSource(matchedConfig.source, reparsed);
    return { ...parsedInput, ...matchedConfig } as Source;
  });

// -----------------------------------------------------------------------------
// Simple pattern routing
// -----------------------------------------------------------------------------

/** Route NameInput: look up installed skill in lockfile and resolve to local path. */
const routeNameInput = (name: string, input: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const skills = yield* ws
      .getLockedSkills()
      .pipe(
        Effect.mapError(
          (e) => new ParseError({ message: `Failed to read lockfile: ${e._tag}`, input }),
        ),
      );
    if (!(name in skills)) {
      return yield* new ParseError({
        message: `Unknown skill "${name}". Check installed skills with \`axm skills list\`.`,
        input,
      });
    }
    return (yield* parseLocalPath(getInstalledSkillPath(name, skills[name]!))) as Source;
  });

/** Route FilePathPattern: parse as local source. */
const routeFilePathInput = (path: string) =>
  Effect.map(parseLocalPath(path), (source) => source as Source);

/** Route RegistryPatternInput: not yet supported. */
const routeRegistryInput = (input: string) =>
  Effect.fail(new ParseError({ message: "Registry source input is not yet supported", input }));

/**
 * Route SlashPattern (owner/repo): iterate git-hosting configs that support
 * shorthand, try each provider in config order. First success wins.
 */
const routeSlashInput = (
  pattern: { readonly owner: string; readonly repo: string },
  input: string,
) =>
  Effect.gen(function* () {
    const sources = yield* getConfiguredSources(input);
    const shorthandTypes = ["github", "gitlab", "bitbucket"] as const;
    const shorthandBody = `${pattern.owner}/${pattern.repo}`;

    const attempts = Array.filterMap(sources, (config) => {
      const sourceType = shorthandTypes.find((t) => t === config.source);
      if (!sourceType) return Option.none();
      return Option.some(
        Effect.map(
          parseShorthandForSource(sourceType, `${sourceType}:${shorthandBody}`),
          (si) => ({ ...si, ...config }) as Source,
        ),
      );
    });

    if (Array.isEmptyReadonlyArray(attempts)) {
      return yield* new ParseError({
        message: `Ambiguous pattern '${pattern.owner}/${pattern.repo}' — no git hosting sources configured`,
        input,
      });
    }

    return yield* Effect.firstSuccessOf(attempts).pipe(
      Effect.mapError(
        () =>
          new ParseError({
            message: `Ambiguous pattern '${pattern.owner}/${pattern.repo}' — use github:${pattern.owner}/${pattern.repo}, gitlab:${pattern.owner}/${pattern.repo}, or bitbucket:${pattern.owner}/${pattern.repo}`,
            input,
          }),
      ),
    );
  });

// -----------------------------------------------------------------------------
// Main resolver
// -----------------------------------------------------------------------------

/**
 * Resolve a source input string into a fully resolved Source.
 *
 * Classifies the input via `parseInputPattern`, then routes each pattern
 * type to the appropriate resolution logic. For URL and SCP patterns,
 * resolution iterates configured sources and matches by hostname + provider
 * parse. For other patterns, resolution handles them directly.
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The source string to resolve
 * @returns Effect containing a resolved Source or ParseError
 */
export const resolveSource = (input: string): Effect.Effect<Source, ParseError, Workspace> =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    if (!trimmed) {
      return yield* new ParseError({ message: "Source string cannot be empty", input });
    }

    const patternOpt = parseInputPattern(trimmed);
    if (Option.isNone(patternOpt)) {
      return yield* new ParseError({ message: "Unable to parse source", input });
    }

    const pattern = patternOpt.value;
    switch (pattern._tag) {
      case "UrlInput":
        return yield* routeUrlInput(pattern.url, trimmed);
      case "GitScpAddress":
        return yield* routeScpInput(pattern, trimmed);
      case "ShorthandInput":
        return yield* routeShorthandInput(pattern.prefix, pattern.input, trimmed);
      case "NameInput":
        return yield* routeNameInput(pattern.name, trimmed);
      case "FilePathPattern":
        return yield* routeFilePathInput(pattern.path);
      case "RegistryPatternInput":
        return yield* routeRegistryInput(trimmed);
      case "SlashPattern":
        return yield* routeSlashInput(pattern, trimmed);
    }
  });
