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
import { makeCliError, type CliError } from "../cli-error/index.js";
import * as github from "./github/index.js";
import * as gitlab from "./gitlab/index.js";
import { parseLocalPath } from "./local/index.js";
import { parseInputPattern } from "./parser.js";
import type {
  RegistrySource,
  RegistrySourceParams,
  Source,
  SourceParams,
  SourceType,
} from "./types.js";
import type { SourceHostConfig } from "../settings/schema.js";
import type { SkillLockEntry } from "../lockfile/index.js";
import { Workspace } from "../workspace/index.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/constants.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Source types that require a matching config from workspace. */
const GIT_HOSTING_TYPES = new Set<SourceType>(["github", "gitlab", "bitbucket", "azurerepos"]);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Get configured sources from workspace, mapping errors to CliError. */
const getConfiguredSources = (input: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    return yield* ws.getConfiguredSources().pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `Failed to get configured sources: ${e._tag}`,
          details: [input],
        }),
      ),
    );
  });

/** Get the relative path of an installed skill from its lockfile entry. */
const getInstalledSkillPath = (name: string, entry: SkillLockEntry): string => {
  if (entry.type === "registry") {
    return `${REGISTRY_EXTENSIONS_DIR}/${entry.scope}/skills/${name}`;
  }
  return `${EXTERNAL_EXTENSIONS_DIR}/skills/${name}`;
};

/** Parse shorthand input using the provider for the given source type. */
const parseShorthandForSource = (
  sourceType: string,
  input: string,
): Effect.Effect<SourceParams, CliError> => {
  switch (sourceType) {
    case "github":
      return github.parseShorthand(input);
    case "gitlab":
      return gitlab.parseShorthand(input);
    case "bitbucket":
      return bitbucket.parseShorthand(input);
    default:
      return Effect.fail(
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `Source type "${sourceType}" does not support shorthand syntax`,
          details: [input],
        }),
      );
  }
};

/**
 * Merge a SourceHostConfig with SourceParams to produce a Source.
 * Uses exhaustive type checks on both discriminators and fails on mismatch.
 */
const configToSource = (
  config: SourceHostConfig,
  params: SourceParams,
  input: string,
): Effect.Effect<Source, CliError> => {
  const mismatch = () =>
    Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: `Source params type "${params.type}" does not match config type "${config.type}"`,
        details: [input],
      }),
    );

  switch (config.type) {
    case "github":
      return params.type === "github" ? Effect.succeed({ ...params, url: config.url }) : mismatch();
    case "gitlab":
      return params.type === "gitlab" ? Effect.succeed({ ...params, url: config.url }) : mismatch();
    case "bitbucket":
      return params.type === "bitbucket"
        ? Effect.succeed({ ...params, url: config.url })
        : mismatch();
    case "azurerepos":
      return params.type === "azurerepos"
        ? Effect.succeed({ ...params, url: config.url })
        : mismatch();
    case "registry":
      return params.type === "registry"
        ? Effect.succeed({ ...params, url: config.location, scopes: Option.none() })
        : mismatch();
  }
};

// -----------------------------------------------------------------------------
// URL routing
// -----------------------------------------------------------------------------

/**
 * Route a URL input by iterating configured sources and matching by
 * hostname + provider parse. First successful match wins.
 */
export const routeUrlInput = (url: URL, input: string) =>
  Effect.gen(function* () {
    // Opaque URLs (empty hostname, e.g. "ghe:owner/repo") may be config-name shorthands
    if (!url.hostname) {
      return yield* routeOpaqueUrl(url, input);
    }

    const sources = yield* getConfiguredSources(input);
    const noMatch = makeCliError({
      code: "SOURCE_PARSE_FAILED",
      what: `No configured source matches URL "${url.href}"`,
      details: [input],
    });

    const tryParseUrl = (
      configUrl: URL,
      config: SourceHostConfig,
      parse: (url: URL, hostname: string) => Effect.Effect<SourceParams, CliError>,
    ) =>
      configUrl.hostname !== url.hostname
        ? Effect.fail(noMatch)
        : Effect.flatMap(parse(url, configUrl.hostname), (params) =>
            configToSource(config, params, input),
          );

    const tryMatch = Match.type<SourceHostConfig>().pipe(
      Match.when({ type: "github" }, (c) => tryParseUrl(c.url, c, github.parseUrl)),
      Match.when({ type: "gitlab" }, (c) => tryParseUrl(c.url, c, gitlab.parseUrl)),
      Match.when({ type: "bitbucket" }, (c) => tryParseUrl(c.url, c, bitbucket.parseUrl)),
      Match.when({ type: "azurerepos" }, (c) => tryParseUrl(c.url, c, azurerepos.parseUrl)),
      Match.when({ type: "registry" }, () => Effect.fail(noMatch)),
      Match.exhaustive,
    );

    const attempts = Array.map(sources, tryMatch);
    if (Array.isEmptyReadonlyArray(attempts)) {
      return yield* noMatch;
    }

    return yield* Effect.firstSuccessOf(attempts).pipe(
      Effect.mapError(() =>
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `No configured source matches URL "${url.href}"`,
          details: [input],
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
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Unable to parse source",
        details: [input],
      });
    }

    const prefix = input.slice(0, colonIndex);
    const sources = yield* getConfiguredSources(input);

    // Check if the scheme matches a config name
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (matchedConfig && GIT_HOSTING_TYPES.has(matchedConfig.type)) {
      const remainder = input.slice(colonIndex + 1);
      const reparsed = `${matchedConfig.type}:${remainder}`;
      const params = yield* parseShorthandForSource(matchedConfig.type, reparsed);
      return yield* configToSource(matchedConfig, params, input);
    }

    // Not a config name — fail
    return yield* makeCliError({
      code: "SOURCE_PARSE_FAILED",
      what: `No configured source matches URL "${url.href}"`,
      details: [input],
    });
  });

// -----------------------------------------------------------------------------
// SCP routing
// -----------------------------------------------------------------------------

/**
 * Route an SCP address by iterating configured sources and matching by
 * hostname + provider parse. First successful match wins.
 */
export const routeScpInput = (
  scp: { readonly user: string; readonly host: string; readonly path: string },
  input: string,
) =>
  Effect.gen(function* () {
    const sources = yield* getConfiguredSources(input);
    const scpInput = `${scp.user}@${scp.host}:${scp.path}`;
    const noMatch = makeCliError({
      code: "SOURCE_PARSE_FAILED",
      what: `No configured source matches SCP address "${scpInput}"`,
      details: [input],
    });

    const tryParseScp = (
      scpHostname: string,
      config: SourceHostConfig,
      parse: (input: string, hostname: string) => Effect.Effect<SourceParams, CliError>,
    ) =>
      scp.host !== scpHostname
        ? Effect.fail(noMatch)
        : Effect.flatMap(parse(scpInput, scp.host), (params) =>
            configToSource(config, params, input),
          );

    const tryMatch = Match.type<SourceHostConfig>().pipe(
      Match.when({ type: "github" }, (c) => tryParseScp(c.url.hostname, c, github.parseScp)),
      Match.when({ type: "gitlab" }, (c) => tryParseScp(c.url.hostname, c, gitlab.parseScp)),
      Match.when({ type: "bitbucket" }, (c) => tryParseScp(c.url.hostname, c, bitbucket.parseScp)),
      Match.when({ type: "azurerepos" }, (c) =>
        tryParseScp(`ssh.${c.url.hostname}`, c, azurerepos.parseScp),
      ),
      Match.when({ type: "registry" }, () => Effect.fail(noMatch)),
      Match.exhaustive,
    );

    const attempts = Array.map(sources, tryMatch);
    if (Array.isEmptyReadonlyArray(attempts)) {
      return yield* noMatch;
    }

    return yield* Effect.firstSuccessOf(attempts).pipe(
      Effect.mapError(() =>
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `No configured source matches SCP address "${scpInput}"`,
          details: [input],
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
export const routeShorthandInput = (prefix: string, shorthandInput: string, input: string) =>
  Effect.gen(function* () {
    const sources = yield* getConfiguredSources(input);

    // Known source-type prefix → dispatch directly, select first config of that type
    const isKnownType = prefix === "github" || prefix === "gitlab" || prefix === "bitbucket";
    if (isKnownType) {
      const params = yield* parseShorthandForSource(prefix, shorthandInput);
      const config = sources.find((s) => s.type === prefix);
      if (!config) {
        return yield* makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `No source config found for source type "${prefix}". Add a source config via settings.`,
          details: [input],
        });
      }
      return yield* configToSource(config, params, input);
    }

    // Config-name prefix → find config, parse with its source type parser
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (!matchedConfig || !GIT_HOSTING_TYPES.has(matchedConfig.type)) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: `Unknown shorthand prefix: "${prefix}"`,
        details: [input],
      });
    }

    const remainder = shorthandInput.slice(prefix.length + 1);
    const reparsed = `${matchedConfig.type}:${remainder}`;
    const params = yield* parseShorthandForSource(matchedConfig.type, reparsed);
    return yield* configToSource(matchedConfig, params, input);
  });

// -----------------------------------------------------------------------------
// Simple pattern routing
// -----------------------------------------------------------------------------

/** Route NameInput: look up installed skill in lockfile, then configured skills. */
export const routeNameInput = (name: string, input: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    // Tier 1: lockfile entry
    const skills = yield* ws.getLockedSkills().pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `Failed to read lockfile: ${e._tag}`,
          details: [input],
        }),
      ),
    );
    if (name in skills) {
      return yield* parseLocalPath(getInstalledSkillPath(name, skills[name]!));
    }

    // Tier 2: configured skill with a source string
    const configured = yield* ws.getConfiguredSkills().pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `Failed to read settings: ${e._tag}`,
          details: [input],
        }),
      ),
    );
    const entry = configured[name];
    if (entry !== undefined && Option.isSome(entry.source)) {
      return yield* resolveSource(entry.source.value);
    }

    return yield* makeCliError({
      code: "SOURCE_PARSE_FAILED",
      what: `Unknown skill "${name}". Check installed skills with \`axm skills list\`.`,
      details: [input],
    });
  });

/** Route FilePathPattern: parse as local source. */
export const routeFilePathInput = (path: string) => parseLocalPath(path);

/** Route RegistryPatternInput: find matching registry config and intersect with params. */
export const routeRegistryInput = (
  pattern: {
    readonly type: Option.Option<"skills" | "mcp-servers">;
    readonly scope: string;
    readonly name: Option.Option<string>;
    readonly versionConstraint: Option.Option<string>;
  },
  input: string,
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    void pattern.type;
    if (Option.isNone(pattern.name)) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Registry source is missing name",
        details: [input],
      });
    }
    const scope = Option.some(pattern.scope);

    const registrySources = yield* ws.getConfiguredRegistrySources(scope).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `Failed to get registry sources: ${e._tag}`,
          details: [input],
        }),
      ),
    );

    const params: RegistrySourceParams = {
      type: "registry" as const,
      scope: pattern.scope,
      name: pattern.name.value,
      versionConstraint: pattern.versionConstraint,
    };

    if (registrySources.length === 0) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: `No registry source configured for scope "${pattern.scope}"`,
        details: [input],
      });
    }

    const regConfig = registrySources[0]!;
    return {
      ...params,
      url: regConfig.location,
      scopes: Option.none(),
    } satisfies RegistrySource;
  });

/**
 * Route SlashPattern (owner/repo): iterate git-hosting configs that support
 * shorthand, try each provider in config order. First success wins.
 */
export const routeSlashInput = (
  pattern: { readonly owner: string; readonly repo: string },
  input: string,
) =>
  Effect.gen(function* () {
    const sources = yield* getConfiguredSources(input);
    const shorthandTypes = ["github", "gitlab", "bitbucket"] as const;
    const shorthandBody = `${pattern.owner}/${pattern.repo}`;

    const attempts = Array.filterMap(sources, (config) => {
      const sourceType = shorthandTypes.find((t) => t === config.type);
      if (!sourceType) return Option.none();
      return Option.some(
        Effect.flatMap(
          parseShorthandForSource(sourceType, `${sourceType}:${shorthandBody}`),
          (params) => configToSource(config, params, input),
        ),
      );
    });

    if (Array.isEmptyReadonlyArray(attempts)) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: `Ambiguous pattern '${pattern.owner}/${pattern.repo}' — no git hosting sources configured`,
        details: [input],
      });
    }

    return yield* Effect.firstSuccessOf(attempts).pipe(
      Effect.mapError(() =>
        makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `Ambiguous pattern '${pattern.owner}/${pattern.repo}' — use github:${pattern.owner}/${pattern.repo}, gitlab:${pattern.owner}/${pattern.repo}, or bitbucket:${pattern.owner}/${pattern.repo}`,
          details: [input],
        }),
      ),
    );
  });

// -----------------------------------------------------------------------------
// Main resolver
// -----------------------------------------------------------------------------

/**
 * Resolve a source string into a fully resolved `Source`.
 *
 * Classifies the input via `parseInputPattern`, then routes each pattern
 * type to the appropriate resolution logic. For URL and SCP patterns,
 * resolution iterates configured sources and matches by hostname + provider
 * parse. For other patterns, resolution handles them directly.
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The source string to resolve
 * @returns Effect containing a resolved `Source` or `CliError`
 */
export const resolveSource = (input: string): Effect.Effect<Source, CliError, Workspace> =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    if (!trimmed) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Source string cannot be empty",
        details: [input],
      });
    }

    const patternOpt = parseInputPattern(trimmed);
    if (Option.isNone(patternOpt)) {
      return yield* makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Unable to parse source",
        details: [input],
      });
    }

    const pattern = patternOpt.value;
    switch (pattern.pattern) {
      case "url-input":
        return yield* routeUrlInput(pattern.url, trimmed);
      case "git-scp-address":
        return yield* routeScpInput(pattern, trimmed);
      case "shorthand-input":
        return yield* routeShorthandInput(pattern.prefix, pattern.input, trimmed);
      case "name-input":
        return yield* routeNameInput(pattern.name, trimmed);
      case "file-path-pattern":
        return yield* routeFilePathInput(pattern.path);
      case "registry-pattern-input":
        return yield* routeRegistryInput(pattern, trimmed);
      case "slash-pattern":
        return yield* routeSlashInput(pattern, trimmed);
      case "glob-input":
        return yield* makeCliError({
          code: "SOURCE_PARSE_FAILED",
          what: `Glob patterns are not supported by resolveSource — use resolveSourcePattern instead`,
          details: [input],
        });
    }
  });
