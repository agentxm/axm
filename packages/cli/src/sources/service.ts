/**
 * SourceHostProviders Effect service.
 *
 * Provides a unified interface for discovering and fetching extensions
 * across all source types, plus clone URL and source display building.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as HttpClient from "@effect/platform/HttpClient";
import * as Path from "@effect/platform/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import type { CliError } from "../cli-error/index.js";
import { Workspace } from "../workspace/service.js";
import type { ExtensionFiles, FindOptions } from "./provider.js";
import type { ExtensionRef, RegistrySource, Source } from "./types.js";
import {
  createBuiltinSourceHostProvider,
  createGitHostingSourceHostProvider,
  createGitSourceHostProvider,
  createLocalSourceHostProvider,
} from "./providers/index.js";
import { createRegistrySourceHostProviderFromHost } from "./providers/registry/index.js";
import { buildCloneUrlForSource } from "./providers/git-hosting.js";

// -----------------------------------------------------------------------------
// Service Interface
// -----------------------------------------------------------------------------

/**
 * Service interface for source host providers.
 *
 * Dependencies (FileSystem, Path, Workspace) are resolved at layer creation —
 * callers only see the service, not its implementation details.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SourceHostProvidersService {
  /** Find extensions matching the given source and search criteria. */
  readonly find: (
    source: Source,
    options: FindOptions,
  ) => Effect.Effect<ReadonlyArray<ExtensionRef>, CliError, Scope.Scope>;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (ref: ExtensionRef) => Effect.Effect<ExtensionFiles, CliError, Scope.Scope>;
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
export class SourceHostProviders extends Context.Tag("@axm.sh/cli/SourceHostProviders")<
  SourceHostProviders,
  SourceHostProvidersService
>() {}

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
    case "builtin":
      return Option.none();
  }
};

// -----------------------------------------------------------------------------
// Origin Building
// -----------------------------------------------------------------------------

/**
 * Get the canonical source string for display/comparison.
 * Handles all source types including builtin.
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
    case "builtin":
      return "builtin";
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
      // Determine namespace from explicit option, or infer from @namespace/name.
      const namespace = Option.isSome(options.namespace)
        ? options.namespace
        : Option.isSome(source.namespace)
          ? source.namespace
          : options.skillNames.length > 0
            ? Option.fromNullable(
                options.skillNames.find((n) => n.startsWith("@"))?.split("/")[0] ?? null,
              )
            : Option.none<string>();

      const provider = yield* createRegistrySourceHostProviderFromHost(source);
      const registrySource: RegistrySource = { ...source, namespace };
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
 * Captures FileSystem, Path, and Workspace at creation time so the
 * service interface doesn't leak these dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceHostProvidersLive: Layer.Layer<
  SourceHostProviders,
  never,
  FileSystem.FileSystem | Path.Path | Workspace
> = Layer.effect(
  SourceHostProviders,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const ambientHttpClient = yield* Effect.serviceOption(HttpClient.HttpClient);

    const localProvider = createLocalSourceHostProvider();
    const gitProvider = createGitSourceHostProvider();
    const builtinProvider = createBuiltinSourceHostProvider();
    const registryMetaProvider = createRegistryMetaProvider();

    // Captured layer for providing to provider operations
    const baseDepLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Workspace, ws),
    );
    const depLayer = Option.match(ambientHttpClient, {
      onNone: () => baseDepLayer,
      onSome: (client) =>
        Layer.merge(
          baseDepLayer,
          Layer.succeed(HttpClient.HttpClient, client),
        ),
    });

    const findImpl = (source: Source, options: FindOptions) => {
      switch (source.type) {
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos": {
          // Assertion needed: Source carries host config (url) at runtime but TS types diverge
          const provider = createGitHostingSourceHostProvider(source as never);
          return provider.find(source as never, options).pipe(Effect.provide(depLayer));
        }
        case "local":
          return localProvider.find(source as never, options).pipe(Effect.provide(depLayer));
        case "git":
          return gitProvider.find(source as never, options).pipe(Effect.provide(depLayer));
        case "registry":
          return registryMetaProvider.find(source, options).pipe(Effect.provide(depLayer));
        case "builtin":
          return builtinProvider.find(source as never, options).pipe(Effect.provide(depLayer));
      }
    };

    return {
      find: findImpl as SourceHostProvidersService["find"],
      fetch: (ref) => {
        const source = ref.source;
        switch (source.type) {
          case "github":
          case "gitlab":
          case "bitbucket":
          case "azurerepos": {
            const provider = createGitHostingSourceHostProvider(source as never);
            return provider.fetch(source as never, ref).pipe(Effect.provide(depLayer));
          }
          case "local":
            return localProvider.fetch(source as never, ref).pipe(Effect.provide(depLayer));
          case "git":
            return gitProvider.fetch(source as never, ref).pipe(Effect.provide(depLayer));
          case "registry":
            return registryMetaProvider
              .fetch(source as never, ref)
              .pipe(Effect.provide(depLayer)) as Effect.Effect<
              ExtensionFiles,
              CliError,
              Scope.Scope
            >;
          case "builtin":
            return builtinProvider.fetch(source as never, ref).pipe(Effect.provide(depLayer));
        }
      },
      cloneUrl: buildCloneUrlFromSource,
      origin: getOriginFromSource,
    };
  }),
);
