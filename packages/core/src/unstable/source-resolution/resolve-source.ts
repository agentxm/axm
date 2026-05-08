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

import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";

import * as azurerepos from "./providers/azurerepos/index.js";
import * as bitbucket from "./providers/bitbucket/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import * as github from "./providers/github/index.js";
import * as gitlab from "./providers/gitlab/index.js";
import { parseLocalPath } from "./providers/local-parser/index.js";
import { parseInputPattern } from "../sources/index.js";
import type {
  InputParseResult,
  ShorthandInput,
  RegistrySource,
  Source,
  SourceParams,
  SourceType,
} from "../sources/index.js";
import { createRegistryClient } from "../registry/index.js";
import { decodeHandleSync, type Handle } from "../extensions/handle.js";
import type { ExtensionName, ExtensionType, ExtensionTypePlural } from "../extensions/index.js";
import {
  decodeExtensionNameSync,
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  isExtensionTypePlural,
  toExtensionType,
} from "../extensions/index.js";
import type { SourceHostConfig } from "../settings/index.js";
import type { SkillLockEntry } from "../lockfile/index.js";
import { WorkspaceMutations } from "../workspace/index.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Source types that require a matching config from workspace. */
const GIT_HOSTING_TYPES = new Set<SourceType>(["github", "gitlab", "bitbucket", "azurerepos"]);

const firstSuccess = <A, E, R>(
  attempts: ReadonlyArray<Effect.Effect<A, E, R>>,
  onFailure: () => E,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    for (const attempt of attempts) {
      const result = yield* Effect.result(attempt);
      if (result._tag === "Success") {
        return result.success;
      }
    }

    return yield* Effect.fail(onFailure());
  });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Get configured sources from workspace, mapping errors to AppError. */
const getConfiguredSources = (_input: string) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* ws.getConfiguredSources().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "SOURCE_PARSE_FAILED",
          category: "validation",
          message: `Failed to get configured sources: ${e._tag}`,
        }),
      ),
    );
  });

/** Get the relative path of an installed skill from its lockfile entry. */
const getInstalledSkillPath = (name: string, entry: SkillLockEntry): string => {
  if (entry.type === "registry") {
    return `${REGISTRY_EXTENSIONS_DIR}/${entry.owner}/skills/${name}`;
  }
  return `${EXTERNAL_EXTENSIONS_DIR}/skills/${name}`;
};

/** Parse shorthand input using the provider for the given source type. */
const parseShorthandForSource = (
  shorthand: ShorthandInput,
): Effect.Effect<SourceParams, AppError> => {
  const input = `${shorthand.prefix}:${shorthand.remainingInput}`;
  switch (shorthand.prefix) {
    case "github":
      return github.parseShorthand(input);
    case "gitlab":
      return gitlab.parseShorthand(input);
    case "bitbucket":
      return bitbucket.parseShorthand(input);
    default:
      return Effect.fail(
        makeAppError({
          code: "SOURCE_PARSE_FAILED",
          category: "validation",
          message: `Source type "${shorthand.prefix}" does not support shorthand syntax`,
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
  _input: string,
): Effect.Effect<Source, AppError> => {
  const mismatch = () =>
    Effect.fail(
      makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: `Source params type "${params.type}" does not match config type "${config.type}"`,
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
      return mismatch();
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
    const noMatch = makeAppError({
      code: "SOURCE_PARSE_FAILED",
      category: "validation",
      message: `No configured source matches URL "${url.href}"`,
    });

    const tryParseUrl = (
      configUrl: URL,
      config: SourceHostConfig,
      parse: (url: URL, hostname: string) => Effect.Effect<SourceParams, AppError>,
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
    if (Array.isReadonlyArrayEmpty(attempts)) {
      return yield* noMatch;
    }

    return yield* firstSuccess(attempts, () =>
      makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: `No configured source matches URL "${url.href}"`,
      }),
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
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: "Unable to parse source",
      });
    }

    const prefix = input.slice(0, colonIndex);
    const sources = yield* getConfiguredSources(input);

    // Check if the scheme matches a config name
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (matchedConfig && GIT_HOSTING_TYPES.has(matchedConfig.type)) {
      const remainder = input.slice(colonIndex + 1);
      const params = yield* parseShorthandForSource({
        pattern: "shorthand-input",
        prefix: matchedConfig.type,
        remainingInput: remainder,
      });
      return yield* configToSource(matchedConfig, params, input);
    }

    // Not a config name — fail
    return yield* makeAppError({
      code: "SOURCE_PARSE_FAILED",
      category: "validation",
      message: `No configured source matches URL "${url.href}"`,
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
    const noMatch = makeAppError({
      code: "SOURCE_PARSE_FAILED",
      category: "validation",
      message: `No configured source matches SCP address "${scpInput}"`,
    });

    const tryParseScp = (
      scpHostname: string,
      config: SourceHostConfig,
      parse: (input: string, hostname: string) => Effect.Effect<SourceParams, AppError>,
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
    if (Array.isReadonlyArrayEmpty(attempts)) {
      return yield* noMatch;
    }

    return yield* firstSuccess(attempts, () =>
      makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: `No configured source matches SCP address "${scpInput}"`,
      }),
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
export const resolveShorthandInputSource = (parseResult: InputParseResult<ShorthandInput>) =>
  Effect.gen(function* () {
    const prefix = parseResult.pattern.prefix;
    const input = parseResult.originalInput;
    const sources = yield* getConfiguredSources(input);

    // Known source-type prefix → dispatch directly, select first config of that type
    const isKnownType = prefix === "github" || prefix === "gitlab" || prefix === "bitbucket";
    if (isKnownType) {
      const params = yield* parseShorthandForSource(parseResult.pattern);
      const config = sources.find((s) => s.type === prefix);
      if (!config) {
        return yield* makeAppError({
          code: "SOURCE_PARSE_FAILED",
          category: "validation",
          message: `No source config found for source type "${prefix}". Add a source config via settings.`,
        });
      }
      return yield* configToSource(config, params, input);
    }

    // Config-name prefix → find config, parse with its source type parser
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (!matchedConfig || !GIT_HOSTING_TYPES.has(matchedConfig.type)) {
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: `Unknown shorthand prefix: "${prefix}"`,
      });
    }

    const params = yield* parseShorthandForSource({
      pattern: "shorthand-input",
      prefix: matchedConfig.type,
      remainingInput: parseResult.pattern.remainingInput,
    });
    return yield* configToSource(matchedConfig, params, input);
  });

// -----------------------------------------------------------------------------
// Simple pattern routing
// -----------------------------------------------------------------------------

/** Route NameInput: look up installed skill in lockfile, then configured skills. */
export const routeNameInput = (
  name: string,
  _input: string,
): Effect.Effect<Source, AppError, FileSystem.FileSystem | Path.Path | WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;

    // Tier 1: lockfile entry
    const skills = yield* ws.getLockedSkills().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "SOURCE_PARSE_FAILED",
          category: "validation",
          message: `Failed to read lockfile: ${e._tag}`,
        }),
      ),
    );
    const lockedSkill = skills[name];
    if (lockedSkill !== undefined) {
      return yield* parseLocalPath(getInstalledSkillPath(name, lockedSkill));
    }

    // Tier 2: configured skill with a source string
    const configured = yield* ws.records.getConfiguredSkills().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "SOURCE_PARSE_FAILED",
          category: "validation",
          message: `Failed to read settings: ${e._tag}`,
        }),
      ),
    );
    const entry = configured[name];
    if (entry !== undefined) {
      return yield* resolveSource(entry.source);
    }

    return yield* makeAppError({
      code: "SOURCE_PARSE_FAILED",
      category: "validation",
      message: `Unknown skill "${name}". Check installed skills with \`axm skills list\`.`,
    });
  });

/** Route RegistryPatternInput: find matching registry config and intersect with params. */
export const routeRegistryInput = (
  pattern: {
    readonly type: Option.Option<ExtensionTypePlural>;
    readonly owner: Handle;
    readonly name: Option.Option<ExtensionName>;
  },
  _input: string,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    // Name filtering is handled in the find phase; this routing step only resolves registry host.

    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "SOURCE_PARSE_FAILED",
          category: "validation",
          message: `Failed to get registry sources: ${e._tag}`,
        }),
      ),
    );

    if (registrySources.length === 0) {
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: `No registry source configured for owner "${pattern.owner}"`,
      });
    }

    const [regConfig] = registrySources;
    if (regConfig === undefined) {
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: `No registry source configured for owner "${pattern.owner}"`,
      });
    }
    return {
      type: "registry" as const,
      location: regConfig.location,
      owner: Option.some(pattern.owner),
    } satisfies RegistrySource;
  });

/**
 * Route SlashPattern (owner/repo): iterate git-hosting configs that support
 * shorthand, try each provider in config order. First success wins.
 */
const registryExtensionTypeFromSegment = (segment: string): Option.Option<ExtensionType> => {
  if (!isExtensionTypePlural(segment)) {
    return Option.none();
  }

  return Option.some(toExtensionType(segment));
};

export const resolveSlashInputSource = (
  pattern: {
    readonly first: string;
    readonly second: string;
    readonly third: Option.Option<string>;
  },
  input: string,
) =>
  Effect.gen(function* () {
    const sources = yield* getConfiguredSources(input);
    const shorthandTypes = ["github", "gitlab", "bitbucket"] as const;
    const shorthandBody = `${pattern.first}/${pattern.second}`;

    if (Option.isSome(pattern.third)) {
      const type = registryExtensionTypeFromSegment(pattern.second);
      if (Option.isSome(type)) {
        const ws = yield* WorkspaceMutations;
        const owner = pattern.first.startsWith("@") ? decodeHandleSync(pattern.first) : undefined;
        const extensionName = (() => {
          try {
            return decodeExtensionNameSync(pattern.third.value);
          } catch {
            return undefined;
          }
        })();
        const registrySources = yield* ws.getRegistrySourceHosts().pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "SOURCE_PARSE_FAILED",
              category: "validation",
              message: `Failed to get registry sources: ${e._tag}`,
            }),
          ),
        );

        if (owner !== undefined && extensionName !== undefined) {
          for (const regSource of registrySources) {
            const client = yield* createRegistryClient(regSource.location.href);
            const exists = yield* client
              .extensionExists({ owner, type: type.value, name: extensionName })
              .pipe(Effect.orElseSucceed(() => false));
            if (exists) {
              return {
                type: "registry" as const,
                location: regSource.location,
                owner: Option.some(owner),
              } satisfies RegistrySource;
            }
          }
        }
      }
    }

    const attempts = sources.flatMap((config) => {
      const sourceType = shorthandTypes.find((t) => t === config.type);
      if (!sourceType) {
        return [];
      }

      return [
        Effect.flatMap(
          parseShorthandForSource({
            pattern: "shorthand-input",
            prefix: sourceType,
            remainingInput: shorthandBody,
          }),
          (params) => configToSource(config, params, input),
        ),
      ];
    });

    if (Array.isReadonlyArrayEmpty(attempts)) {
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: `Ambiguous pattern '${pattern.first}/${pattern.second}' — no git hosting sources configured`,
      });
    }

    return yield* firstSuccess(attempts, () =>
      makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: `Ambiguous pattern '${pattern.first}/${pattern.second}' — use github:${pattern.first}/${pattern.second}, gitlab:${pattern.first}/${pattern.second}, or bitbucket:${pattern.first}/${pattern.second}`,
      }),
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
 * @returns Effect containing a resolved `Source` or `AppError`
 */
export const resolveSource = (
  input: string,
): Effect.Effect<Source, AppError, FileSystem.FileSystem | Path.Path | WorkspaceMutations> =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    if (!trimmed) {
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: "Source string cannot be empty",
      });
    }

    const parseResultOpt = parseInputPattern(trimmed);
    if (Option.isNone(parseResultOpt)) {
      return yield* makeAppError({
        code: "SOURCE_PARSE_FAILED",
        category: "validation",
        message: "Unable to parse source",
      });
    }

    const parsed = parseResultOpt.value;
    const pattern = parsed.pattern;
    switch (pattern.pattern) {
      case "url-input":
        return yield* routeUrlInput(pattern.url, parsed.originalInput);
      case "git-scp-address":
        return yield* routeScpInput(pattern, parsed.originalInput);
      case "shorthand-input":
        return yield* resolveShorthandInputSource({
          pattern,
          originalInput: parsed.originalInput,
        });
      case "name-input":
        return yield* routeNameInput(pattern.name, parsed.originalInput);
      case "file-path-pattern":
        return { type: "local" as const, path: pattern.path };
      case "registry-pattern-input":
        return yield* routeRegistryInput(pattern, parsed.originalInput);
      case "slash-pattern":
        return yield* resolveSlashInputSource(pattern, parsed.originalInput);
      case "glob-input":
        return yield* makeAppError({
          code: "SOURCE_PARSE_FAILED",
          category: "validation",
          message: `Glob patterns are not supported by resolveSource — use resolveSourcePattern instead`,
        });
    }
  });
