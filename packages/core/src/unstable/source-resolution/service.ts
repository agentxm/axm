/**
 * SourceHostProviders Effect service.
 *
 * Provides a unified interface for discovering and fetching extensions
 * across all source types, plus clone URL and source display building.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import type { AppError } from "../app-error/index.js";
import { parseRegistrySourcePatternParts } from "../extensions/index.js";
import { WorkspaceMutations } from "../workspace/index.js";
import type { ExtensionRef } from "../extensions/index.js";
import type {
  ExtensionFiles,
  FindOptions,
  GitHostingSource,
  RegistrySource,
  Source,
} from "../sources/index.js";
import { createGitSourceHostProvider } from "./providers/git.js";
import { createGitHostingSourceHostProvider } from "./providers/git-hosting.js";
import { createLocalSourceHostProvider } from "./providers/local.js";
import { createRegistrySourceHostProviderFromHost } from "./providers/registry/host-provider.js";
import { buildCloneUrlForSource } from "./providers/git-hosting.js";

// -----------------------------------------------------------------------------
// Service Interface
// -----------------------------------------------------------------------------

/**
 * Service interface for source host providers.
 *
 * Dependencies (FileSystem, Path, WorkspaceMutations) are resolved at layer creation —
 * callers only see the service, not its implementation details.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SourceHostProvidersService {
  /** Find extensions matching the given source and search criteria. */
  readonly find: (
    source: Source,
    options: FindOptions,
  ) => Effect.Effect<ReadonlyArray<ExtensionRef>, AppError, Scope.Scope>;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (ref: ExtensionRef) => Effect.Effect<ExtensionFiles, AppError, Scope.Scope>;
  /** Build a git clone URL for this source. Returns None for non-git sources. */
  readonly cloneUrl: (source: Source) => Option.Option<string>;
  /** Canonical origin string for display/comparison. */
  readonly origin: (source: Source) => string;
}

/**
 * Effect service tag for source host providers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SourceHostProviders extends ServiceMap.Service<
  SourceHostProviders,
  SourceHostProvidersService
>()("axm.sh/SourceHostProviders") {}

// -----------------------------------------------------------------------------
// Clone URL Building
// -----------------------------------------------------------------------------

/**
 * Build a git clone URL from a source.
 * Returns Some for git-based hosting sources, None for others.
 */
const buildCloneUrlFromSource = (source: Source): Option.Option<string> => {
  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
    case "azurerepos":
      return Option.some(buildCloneUrlForSource(source));
    case "git":
    case "registry":
    case "local":
      return Option.none();
  }
};

// -----------------------------------------------------------------------------
// Origin Building
// -----------------------------------------------------------------------------

/**
 * Get the canonical source string for display/comparison.
 */
const getOriginFromSource = (source: Source): string => {
  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "azurerepos":
      return `${source.url.origin}/${source.organization}/${source.project}/_git/${source.repo}`;
    case "local":
      return source.path;
    case "git":
      return source.url.href;
    case "registry":
      return source.location.href;
  }
};

// -----------------------------------------------------------------------------
// Registry Meta-Provider
// -----------------------------------------------------------------------------

/**
 * Creates a registry meta-provider that delegates find/fetch to the
 * resolved registry host encoded in the provided `RegistrySource`.
 *
 * @internal
 */
export const createRegistryMetaProvider = () => ({
  type: "registry" as const,

  find: (source: RegistrySource, options: FindOptions) =>
    Effect.gen(function* () {
      // Determine owner from explicit option, or infer from @owner/name.
      const owner = Option.isSome(options.owner)
        ? options.owner
        : Option.isSome(source.owner)
          ? source.owner
          : options.names.length > 0
            ? Option.fromUndefinedOr(
                (() => {
                  const requestedName = options.names.find((name) => name.startsWith("@"));
                  return requestedName === undefined
                    ? undefined
                    : parseRegistrySourcePatternParts(requestedName)?.owner;
                })(),
              )
            : Option.none();

      const provider = yield* createRegistrySourceHostProviderFromHost(source);
      const registrySource: RegistrySource = { ...source, owner };
      return yield* provider.find(registrySource, options);
    }),

  fetch: (source: RegistrySource, ref: ExtensionRef) =>
    Effect.flatMap(createRegistrySourceHostProviderFromHost(source), (provider) =>
      provider.fetch(source, ref),
    ),
});

// -----------------------------------------------------------------------------
// Layer
// -----------------------------------------------------------------------------

/**
 * Live layer for SourceHostProviders.
 *
 * Constructs the provider registry with all source type providers.
 * Captures FileSystem, Path, and WorkspaceMutations at creation time so the
 * service interface doesn't leak these dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceHostProvidersLive: Layer.Layer<
  SourceHostProviders,
  never,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = Layer.effect(
  SourceHostProviders,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const ambientHttpClient = yield* Effect.serviceOption(HttpClient.HttpClient);

    const localProvider = createLocalSourceHostProvider();
    const gitProvider = createGitSourceHostProvider();
    const registryMetaProvider = createRegistryMetaProvider();

    // Captured layer for providing to provider operations
    const baseDepLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(WorkspaceMutations, ws),
    );
    const depLayer = Option.match(ambientHttpClient, {
      onNone: () => baseDepLayer,
      onSome: (client) => Layer.merge(baseDepLayer, Layer.succeed(HttpClient.HttpClient, client)),
    });

    const findGitHosting = (source: GitHostingSource, options: FindOptions) => {
      const provider = createGitHostingSourceHostProvider(source);
      return provider.find(source, options).pipe(Effect.provide(depLayer));
    };

    const fetchGitHosting = (source: GitHostingSource, ref: ExtensionRef) => {
      const provider = createGitHostingSourceHostProvider(source);
      return provider.fetch(source, ref).pipe(Effect.provide(depLayer));
    };

    const findImpl = (source: Source, options: FindOptions) => {
      switch (source.type) {
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
          return findGitHosting(source, options);
        case "local":
          return localProvider.find(source, options).pipe(Effect.provide(depLayer));
        case "git":
          return gitProvider.find(source, options).pipe(Effect.provide(depLayer));
        case "registry":
          return registryMetaProvider.find(source, options).pipe(Effect.provide(depLayer));
      }
    };

    const fetchImpl = (
      source: Source,
      ref: ExtensionRef,
    ): Effect.Effect<ExtensionFiles, AppError, Scope.Scope> => {
      switch (source.type) {
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
          return fetchGitHosting(source, ref);
        case "local":
          return localProvider.fetch(source, ref).pipe(Effect.provide(depLayer));
        case "git":
          return gitProvider.fetch(source, ref).pipe(Effect.provide(depLayer));
        case "registry":
          return registryMetaProvider.fetch(source, ref).pipe(Effect.provide(depLayer));
      }
    };

    const service: SourceHostProvidersService = {
      find: (source, options) =>
        findImpl(source, options).pipe(Effect.withSpan("SourceHostProviders.find")),
      fetch: (ref) => {
        const source = ref.source;
        return fetchImpl(source, ref).pipe(Effect.withSpan("SourceHostProviders.fetch"));
      },
      cloneUrl: buildCloneUrlFromSource,
      origin: getOriginFromSource,
    };

    return service;
  }),
);
