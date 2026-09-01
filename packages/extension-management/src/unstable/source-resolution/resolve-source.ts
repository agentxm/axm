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
import type * as HttpClient from "effect/unstable/http/HttpClient";
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
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import type {
  InputParseResult,
  ShorthandInput,
} from "@agentxm/extension-model/unstable/sources/parser";
import type {
  GitSource,
  RegistrySource,
  Source,
  SourceParams,
} from "@agentxm/extension-model/unstable/sources/types";
import { createRegistryClient } from "../registry/index.js";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type {
  ExtensionName,
  ExtensionType,
  ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import {
  decodeExtensionNameSync,
  extensionTypeSentenceLabels,
  isExtensionTypePlural,
  parseRegistrySourcePatternParts,
  toExtensionType,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { SourceHostConfig } from "../settings/index.js";
import { WorkspaceMutations } from "../workspace/index.js";
import { refFromFragment, refFromUrlHash, stripUrlHash } from "./url-fragment.js";
import { toAppError } from "../app-error/conversions.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const isGenericGitUrl = (url: URL): boolean =>
  url.protocol === "git:" || url.protocol === "ssh:" || url.pathname.endsWith(".git");

const genericGitSourceFromUrl = (url: URL): GitSource => ({
  type: "git",
  url: stripUrlHash(url),
  ref: refFromUrlHash(url),
});

const withRefFallback = (params: SourceParams, ref: Option.Option<string>): SourceParams => {
  if (Option.isNone(ref)) return params;

  switch (params.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
    case "azurerepos":
    case "git":
      return Option.isSome(params.ref) ? params : { ...params, ref };
    case "registry":
    case "local":
    case "inline":
    case "workspace":
      return params;
  }
};

const withCloneUrl = (source: Source, cloneUrl: Option.Option<string>): Source => {
  if (Option.isNone(cloneUrl)) return source;

  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
    case "azurerepos":
      return { ...source, cloneUrl };
    case "git":
    case "registry":
    case "local":
    case "workspace":
      return source;
  }
};

const splitScpPathRef = (scp: {
  readonly user: string;
  readonly host: string;
  readonly path: string;
}) => {
  const refIndex = scp.path.lastIndexOf("#");
  if (refIndex < 0) {
    return {
      scp,
      ref: Option.none<string>(),
      cloneUrl: new URL(`ssh://${scp.user}@${scp.host}/${scp.path}`),
    };
  }

  const path = scp.path.slice(0, refIndex);
  const rawRef = scp.path.slice(refIndex + 1);
  const ref = refFromFragment(rawRef);

  return {
    scp: { ...scp, path },
    ref,
    cloneUrl: new URL(`ssh://${scp.user}@${scp.host}/${path}`),
  };
};

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
    return yield* ws
      .getConfiguredSources()
      .pipe(Effect.mapError(toAppError))
      .pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "validation",
            detail: `Failed to get configured sources: ${e._tag}`,
          }),
        ),
      );
  });

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
    case "azurerepos":
      return azurerepos.parseShorthand(input);
    case "registry": {
      const parsed = parseRegistrySourcePatternParts(shorthand.remainingInput);
      return parsed === undefined
        ? Effect.fail(
            makeAppError({
              code: "validation",
              detail: `Invalid Registry source reference "${input}"`,
            }),
          )
        : Effect.succeed({ type: "registry", owner: Option.some(parsed.owner) });
    }
    default:
      return Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Source type "${shorthand.prefix}" does not support shorthand syntax`,
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
        code: "validation",
        detail: `Source params type "${params.type}" does not match config type "${config.type}"`,
      }),
    );

  switch (config.type) {
    case "github":
      return params.type === "github"
        ? Effect.succeed({ ...params, name: config.name, url: config.url })
        : mismatch();
    case "gitlab":
      return params.type === "gitlab"
        ? Effect.succeed({ ...params, name: config.name, url: config.url })
        : mismatch();
    case "bitbucket":
      return params.type === "bitbucket"
        ? Effect.succeed({ ...params, name: config.name, url: config.url })
        : mismatch();
    case "azurerepos":
      return params.type === "azurerepos"
        ? Effect.succeed({ ...params, name: config.name, url: config.url })
        : mismatch();
    case "registry":
      return params.type === "registry"
        ? Effect.succeed({ ...params, name: config.name, location: config.location })
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
    const noMatch = makeAppError({
      code: "validation",
      detail: `No configured source matches URL "${url.href}"`,
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
      if (isGenericGitUrl(url)) {
        return genericGitSourceFromUrl(url);
      }
      return yield* noMatch;
    }

    const matches: Source[] = [];
    for (const attempt of attempts) {
      const result = yield* Effect.result(attempt);
      if (result._tag === "Success") {
        matches.push(result.success);
      }
    }

    const [match, ...remainingMatches] = matches;
    if (match !== undefined && remainingMatches.length === 0) return match;
    if (match !== undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `URL "${url.href}" matches multiple configured sources: ${matches
          .flatMap((source) => ("name" in source ? [source.name] : []))
          .join(", ")}. Select one by source name.`,
      });
    }

    if (isGenericGitUrl(url)) {
      return genericGitSourceFromUrl(url);
    }

    return yield* makeAppError({
      code: "validation",
      detail: `No configured source matches URL "${url.href}"`,
    });
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
        code: "validation",
        detail: "Unable to parse source",
      });
    }

    const prefix = input.slice(0, colonIndex);
    const sources = yield* getConfiguredSources(input);

    // Check if the scheme matches a config name
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (matchedConfig !== undefined) {
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
      code: "validation",
      detail: `No configured source matches URL "${url.href}"`,
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
    const scpParts = splitScpPathRef(scp);
    const scpInput = `${scpParts.scp.user}@${scpParts.scp.host}:${scpParts.scp.path}`;
    const noMatch = makeAppError({
      code: "validation",
      detail: `No configured source matches SCP address "${scpInput}"`,
    });

    const tryParseScp = (
      scpHostname: string,
      config: SourceHostConfig,
      parse: (input: string, hostname: string) => Effect.Effect<SourceParams, AppError>,
    ) =>
      scpParts.scp.host !== scpHostname
        ? Effect.fail(noMatch)
        : Effect.flatMap(parse(scpInput, scpParts.scp.host), (params) =>
            Effect.map(
              configToSource(config, withRefFallback(params, scpParts.ref), input),
              (source) => withCloneUrl(source, Option.some(scpParts.cloneUrl.href)),
            ),
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
    const genericGitSource = genericGitSourceFromUrl(scpParts.cloneUrl);
    const genericGitSourceWithRef = { ...genericGitSource, ref: scpParts.ref };
    if (Array.isReadonlyArrayEmpty(attempts)) {
      return genericGitSourceWithRef;
    }

    const matches: Source[] = [];
    for (const attempt of attempts) {
      const result = yield* Effect.result(attempt);
      if (result._tag === "Success") {
        matches.push(result.success);
      }
    }

    const [match, ...remainingMatches] = matches;
    if (match !== undefined && remainingMatches.length === 0) return match;
    if (match !== undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `SCP address "${scpInput}" matches multiple configured sources: ${matches
          .flatMap((source) => ("name" in source ? [source.name] : []))
          .join(", ")}. Select one by source name.`,
      });
    }

    return genericGitSourceWithRef;
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

    // Prefixes always select an exact configured source name.
    const matchedConfig = sources.find((s) => s.name === prefix);
    if (matchedConfig === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `No configured source named "${prefix}"`,
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

/** Route NameInput through the complete desired extension graph. */
export const routeNameInput = (
  name: string,
  _input: string,
  expectedType: ExtensionType = "skill",
): Effect.Effect<
  Source,
  AppError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
    if (!graph.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Cannot resolve the ${extensionTypeSentenceLabels[expectedType]} while the desired extension graph is incomplete.`,
        recover: "Repair or reinstall the configured packs, then retry.",
      });
    }
    const desired = graph.nodes.find((node) => node.type === expectedType && node.name === name);
    if (desired?.source !== undefined) {
      return yield* resolveSource(desired.source);
    }

    return yield* makeAppError({
      code: "validation",
      detail: `Unknown ${extensionTypeSentenceLabels[expectedType]} "${name}".`,
      suggestions: [
        {
          description: `Inspect configured ${extensionTypeSentenceLabels[expectedType]} entries.`,
          cmd: `axm ${toExtensionTypePlural(expectedType)} list`,
        },
      ],
    });
  });

/** Route RegistryPatternInput: find matching registry config and intersect with params. */
export const routeRegistryInput = (
  pattern: {
    readonly sourceName: string;
    readonly type: Option.Option<ExtensionTypePlural>;
    readonly owner: Handle;
    readonly name: Option.Option<ExtensionName>;
  },
  _input: string,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    // Name filtering is handled in the find phase; this routing step only resolves registry host.

    const sources = yield* ws
      .getConfiguredSources()
      .pipe(Effect.mapError(toAppError))
      .pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "validation",
            detail: `Failed to get source ${pattern.sourceName}: ${e._tag}`,
          }),
        ),
      );
    const configured = Option.fromUndefinedOr(
      sources.find((source) => source.name === pattern.sourceName),
    );
    if (Option.isNone(configured) || configured.value.type !== "registry") {
      return yield* makeAppError({
        code: "validation",
        detail: `No Registry source named "${pattern.sourceName}" is configured`,
      });
    }
    return {
      type: "registry" as const,
      name: configured.value.name,
      location: configured.value.location,
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
    const shorthandBody = Option.match(pattern.third, {
      onNone: () => `${pattern.first}/${pattern.second}`,
      onSome: (subPath) => `${pattern.first}/${pattern.second}//${subPath}`,
    });

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
        const registrySources = (yield* ws
          .getRegistrySourceHosts()
          .pipe(Effect.mapError(toAppError))
          .pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                detail: `Failed to get registry sources: ${e._tag}`,
              }),
            ),
          )).filter((source) => source.name === "agentxm");

        if (owner !== undefined && extensionName !== undefined) {
          for (const regSource of registrySources) {
            const client = yield* createRegistryClient(regSource.location.href);
            const exists = yield* client
              .extensionExists({ owner, type: type.value, name: extensionName })
              .pipe(Effect.orElseSucceed(() => false));
            if (exists) {
              return {
                type: "registry" as const,
                name: regSource.name,
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
        code: "validation",
        detail: `Ambiguous pattern '${pattern.first}/${pattern.second}' — no git hosting sources configured`,
      });
    }

    return yield* firstSuccess(attempts, () =>
      makeAppError({
        code: "validation",
        detail: `Ambiguous pattern '${pattern.first}/${pattern.second}' — use github:${pattern.first}/${pattern.second}, gitlab:${pattern.first}/${pattern.second}, or bitbucket:${pattern.first}/${pattern.second}`,
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
  options?: { readonly expectedType?: ExtensionType },
): Effect.Effect<
  Source,
  AppError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    if (!trimmed) {
      return yield* makeAppError({
        code: "validation",
        detail: "Source string cannot be empty",
      });
    }

    const parseResultOpt = parseInputPattern(trimmed);
    if (Option.isNone(parseResultOpt)) {
      return yield* makeAppError({
        code: "validation",
        detail: "Unable to parse source",
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
        return yield* routeNameInput(
          pattern.name,
          parsed.originalInput,
          options?.expectedType ?? "skill",
        );
      case "file-path-pattern":
        return { type: "local" as const, path: pattern.path };
      case "registry-pattern-input":
        return yield* routeRegistryInput(pattern, parsed.originalInput);
      case "slash-pattern":
        return yield* resolveSlashInputSource(pattern, parsed.originalInput);
      case "glob-input":
        return yield* makeAppError({
          code: "validation",
          detail: `Glob patterns are not supported by resolveSource — use resolveSourcePattern instead`,
        });
      case "workspace-pattern-input":
        return {
          type: "workspace",
          owner: pattern.owner,
          extensionType: pattern.type,
          name: pattern.name,
        };
    }
    return yield* makeAppError({
      code: "validation",
      detail: "Unable to resolve source pattern",
    });
  });
