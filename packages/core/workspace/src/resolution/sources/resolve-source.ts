/**
 * Source resolution: classifies input via parseInputPattern, then routes
 * each pattern type to the appropriate resolution logic.
 *
 * Forge shorthands and known browser URLs are normalized into generic Git
 * sources. Clone URLs and SCP addresses are accepted without host
 * configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "effect/FileSystem";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as azurerepos from "./providers/azurerepos/index.js";
import * as bitbucket from "./providers/bitbucket/index.js";
import * as github from "./providers/github/index.js";
import * as gitlab from "./providers/gitlab/index.js";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import type {
  InputParseResult,
  ShorthandInput,
} from "@agentxm/extension-model/unstable/sources/parser";
import type {
  AzureReposSourceParams,
  BitbucketSourceParams,
  GitSource,
  GitHubSourceParams,
  GitLabSourceParams,
  RegistrySource,
  Source,
} from "@agentxm/extension-model/unstable/sources/types";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type {
  ExtensionName,
  ExtensionType,
  ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import {
  extensionTypeSentenceLabels,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import {
  SourceHostNotConfigured,
  SourceNotResolvable,
  SourceSyntaxInvalid,
  type SourceResolutionFailure,
} from "./errors.js";
import { WorkspaceCatalog } from "./workspace-catalog.js";
import { refFromFragment, refFromUrlHash, stripUrlHash } from "./url-fragment.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const isGitCloneProtocol = (url: URL): boolean =>
  url.protocol === "https:" || url.protocol === "ssh:" || url.protocol === "git:";

const genericGitSourceFromUrl = (
  url: URL,
  subPath: Option.Option<string> = Option.none(),
): GitSource => ({
  type: "git",
  url: stripUrlHash(url),
  ref: refFromUrlHash(url),
  subPath,
});

type ForgeSourceParams =
  GitHubSourceParams | GitLabSourceParams | BitbucketSourceParams | AzureReposSourceParams;

const gitSourceFromForgeParams = (params: ForgeSourceParams): GitSource => {
  const cloneUrl =
    params.type === "azurerepos"
      ? new URL(
          `${params.organization}/${params.project}/_git/${params.repo}`,
          "https://dev.azure.com/",
        )
      : new URL(
          `${params.owner}/${params.repo}.git`,
          params.type === "github"
            ? "https://github.com/"
            : params.type === "gitlab"
              ? "https://gitlab.com/"
              : "https://bitbucket.org/",
        );
  return {
    type: "git",
    url: cloneUrl,
    ref: params.ref,
    subPath: params.subPath,
  };
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

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Parse shorthand input using the provider for the given source type. */
const parseShorthandForSource = (
  shorthand: ShorthandInput,
): Effect.Effect<GitSource, SourceSyntaxInvalid> => {
  const input = `${shorthand.prefix}:${shorthand.remainingInput}`;
  switch (shorthand.prefix) {
    case "github":
      return github.parseShorthand(input).pipe(Effect.map(gitSourceFromForgeParams));
    case "gitlab":
      return gitlab.parseShorthand(input).pipe(Effect.map(gitSourceFromForgeParams));
    case "bitbucket":
      return bitbucket.parseShorthand(input).pipe(Effect.map(gitSourceFromForgeParams));
    case "azurerepos":
      return azurerepos.parseShorthand(input).pipe(Effect.map(gitSourceFromForgeParams));
    default:
      return Effect.fail(
        new SourceSyntaxInvalid({
          detail: `Source type "${shorthand.prefix}" does not support shorthand syntax`,
        }),
      );
  }
};

// -----------------------------------------------------------------------------
// URL routing
// -----------------------------------------------------------------------------

/**
 * Normalize known public forge browser URLs, then accept any supported clone
 * URL as a generic Git source.
 */
export const routeUrlInput = (url: URL, _input: string) =>
  Effect.gen(function* () {
    if (!url.hostname || !isGitCloneProtocol(url)) {
      return yield* new SourceSyntaxInvalid({
        detail: `Unsupported Git clone URL "${url.href}": expected https, ssh, or git`,
      });
    }

    const parseKnownBrowserUrl =
      url.hostname === "github.com"
        ? github.parseUrl(url).pipe(Effect.map(gitSourceFromForgeParams))
        : url.hostname === "gitlab.com"
          ? gitlab.parseUrl(url).pipe(Effect.map(gitSourceFromForgeParams))
          : url.hostname === "bitbucket.org"
            ? bitbucket.parseUrl(url).pipe(Effect.map(gitSourceFromForgeParams))
            : url.hostname === "dev.azure.com"
              ? azurerepos.parseUrl(url).pipe(Effect.map(gitSourceFromForgeParams))
              : undefined;
    if (parseKnownBrowserUrl === undefined) return genericGitSourceFromUrl(url);

    const parsed = yield* Effect.result(parseKnownBrowserUrl);
    return parsed._tag === "Success" ? parsed.success : genericGitSourceFromUrl(url);
  });

// -----------------------------------------------------------------------------
// SCP routing
// -----------------------------------------------------------------------------

/**
 * Normalize an SCP-style Git address into an SSH clone URL.
 */
export const routeScpInput = (
  scp: { readonly user: string; readonly host: string; readonly path: string },
  _input: string,
) => {
  const scpParts = splitScpPathRef(scp);
  return Effect.succeed({
    ...genericGitSourceFromUrl(scpParts.cloneUrl),
    ref: scpParts.ref,
  });
};

// -----------------------------------------------------------------------------
// Shorthand routing
// -----------------------------------------------------------------------------

/**
 * Route a built-in forge shorthand such as `github:owner/repo`.
 */
export const resolveShorthandInputSource = (parseResult: InputParseResult<ShorthandInput>) =>
  parseShorthandForSource(parseResult.pattern);

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
  SourceResolutionFailure,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | WorkspaceCatalog
> =>
  Effect.gen(function* () {
    const catalog = yield* WorkspaceCatalog;
    const graph = yield* catalog.desiredExtensionGraph;
    if (!graph.complete) {
      return yield* new SourceNotResolvable({
        category: "conflict",
        detail: `Cannot resolve the ${extensionTypeSentenceLabels[expectedType]} while the desired extension graph is incomplete.`,
        recover: "Repair or reinstall the configured packs, then retry.",
      });
    }
    const desired = graph.nodes.find((node) => node.type === expectedType && node.name === name);
    if (desired?.source !== undefined) {
      return yield* resolveSource(desired.source);
    }

    return yield* new SourceNotResolvable({
      category: "validation",
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
    const catalog = yield* WorkspaceCatalog;
    // Name filtering is handled in the find phase; this routing step only resolves registry host.

    const sources = yield* catalog.configuredSources.pipe(
      Effect.mapError(
        (e) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Failed to get source ${pattern.sourceName}: ${e._tag}`,
          }),
      ),
    );
    const configured = Option.fromUndefinedOr(
      sources.find((source) => source.name === pattern.sourceName),
    );
    if (Option.isNone(configured) || configured.value.type !== "registry") {
      return yield* new SourceHostNotConfigured({
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

/** Route bare owner/repository input through the built-in GitHub sugar. */
export const resolveSlashInputSource = (
  pattern: {
    readonly first: string;
    readonly second: string;
    readonly third: Option.Option<string>;
    readonly ref: Option.Option<string>;
  },
  _input: string,
) => {
  const shorthandBody = Option.match(pattern.third, {
    onNone: () => `${pattern.first}/${pattern.second}`,
    onSome: (subPath) => `${pattern.first}/${pattern.second}//${subPath}`,
  });
  const withRef = Option.match(pattern.ref, {
    onNone: () => shorthandBody,
    onSome: (ref) => `${shorthandBody}@${ref}`,
  });
  return parseShorthandForSource({
    pattern: "shorthand-input",
    prefix: "github",
    remainingInput: withRef,
  });
};

// -----------------------------------------------------------------------------
// Main resolver
// -----------------------------------------------------------------------------

/**
 * Resolve a source string into a fully resolved `Source`.
 *
 * Classifies the input via `parseInputPattern`, then routes each pattern
 * type to the appropriate resolution logic. Forge-shaped inputs become
 * generic Git sources; registry aliases remain settings-backed.
 *
 * @experimental This API is unstable and may change without notice.
 * @param input - The source string to resolve
 * @returns Effect containing a resolved `Source` or a typed resolution failure
 */
export const resolveSource = (
  input: string,
  options?: { readonly expectedType?: ExtensionType },
): Effect.Effect<
  Source,
  SourceResolutionFailure,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | WorkspaceCatalog
> =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    if (!trimmed) {
      return yield* new SourceSyntaxInvalid({
        detail: "Source string cannot be empty",
      });
    }

    const parseResultOpt = parseInputPattern(trimmed);
    if (Option.isNone(parseResultOpt)) {
      return yield* new SourceSyntaxInvalid({
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
        return yield* routeRegistryInput(
          trimmed.startsWith("@")
            ? { ...pattern, sourceName: yield* (yield* WorkspaceCatalog).defaultRegistry }
            : pattern,
          parsed.originalInput,
        );
      case "slash-pattern":
        return yield* resolveSlashInputSource(pattern, parsed.originalInput);
      case "glob-input":
        return yield* new SourceSyntaxInvalid({
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
    return yield* new SourceSyntaxInvalid({
      detail: "Unable to resolve source pattern",
    });
  });
