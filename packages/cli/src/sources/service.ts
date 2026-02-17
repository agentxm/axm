/**
 * SourceHostProviders Effect service.
 *
 * Provides a unified interface for discovering and fetching extensions
 * across all source types, plus clone URL and origin building.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import type { CliError } from "../cli-error/index.js";
import { makeCliError } from "../cli-error/index.js";
import { Workspace } from "../workspace/service.js";
import type { ExtensionFiles, FindOptions } from "./provider.js";
import type { Source, RegistrySourceParams, SourceExtensionRef } from "./types.js";
import {
  createBuiltinSourceHostProvider,
  createGitHostingSourceHostProvider,
  createGitSourceHostProvider,
  createLocalSourceHostProvider,
  createRegistryProvider,
} from "./providers/index.js";
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
  ) => Effect.Effect<ReadonlyArray<SourceExtensionRef>, CliError, Scope.Scope>;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (ref: SourceExtensionRef) => Effect.Effect<ExtensionFiles, CliError, Scope.Scope>;
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
 * Get the canonical origin string for display/comparison.
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
      return source.url.origin;
    case "builtin":
      return "builtin";
  }
};

// -----------------------------------------------------------------------------
// Registry Meta-Provider
// -----------------------------------------------------------------------------

/**
 * Creates a registry meta-provider that wraps N configured registries
 * into a single find/fetch interface returning `SourceExtensionRef`.
 *
 * Reads `workspace.getConfiguredRegistrySources()` lazily on each call — always
 * reflects the current config (including sources added by the registry guard).
 *
 * Reads all configured registry sources for lookups.
 * 404 → fallthrough within the set; other errors → hard fail.
 *
 * @internal
 */
export const createRegistryMetaProvider = () => ({
  type: "registry" as const,

  find: (source: RegistrySourceParams, options: FindOptions) =>
    Effect.gen(function* () {
      const ws = yield* Workspace;

      // Determine scope from source (e.g. @scope/name install) or from options names
      const sourceScope = source.scope ? Option.some(source.scope) : Option.none<string>();
      const scope = Option.isSome(sourceScope)
        ? sourceScope
        : options.names.length > 0
          ? Option.fromNullable(options.names.find((n) => n.startsWith("@"))?.split("/")[0] ?? null)
          : Option.none<string>();

      const registrySources = yield* ws.getConfiguredRegistrySources(scope).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Failed to get registry sources: ${e._tag}`,
            cause: e,
          }),
        ),
      );

      if (registrySources.length === 0) {
        return [] as ReadonlyArray<SourceExtensionRef>;
      }

      // Try each registry source in order. 404 (empty results) → fallthrough.
      // Sequential: early-exits on first non-404 error (can't use Effect.forEach)
      const allRefs: Array<SourceExtensionRef> = [];

      for (const regSource of registrySources) {
        const provider = createRegistryProvider(regSource.url.href);
        const result = yield* provider.find(source, options).pipe(Effect.either);

        if (result._tag === "Left") {
          // Non-404 errors → hard fail
          return yield* Effect.fail(result.left);
        }

        if (result.right.length > 0) {
          allRefs.push(...result.right);
        }
      }

      return allRefs as ReadonlyArray<SourceExtensionRef>;
    }),

  fetch: (source: RegistrySourceParams, ref: SourceExtensionRef) => {
    // Build the registry provider from the source scope to determine the registry root
    // The ref's source has the scope info we need
    if (ref.source.type === "registry" && "url" in ref.source) {
      const provider = createRegistryProvider(ref.source.url.href);
      return provider.fetch(source, ref);
    }
    // Fallback: use the source scope to find the registry
    return Effect.gen(function* () {
      const ws = yield* Workspace;
      const scope = source.scope ? Option.some(source.scope) : Option.none<string>();
      const registrySources = yield* ws.getConfiguredRegistrySources(scope).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Failed to get registry sources: ${e._tag}`,
            cause: e,
          }),
        ),
      );
      if (registrySources.length === 0) {
        return yield* Effect.fail(
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: "No registry sources configured",
          }),
        );
      }
      const provider = createRegistryProvider(registrySources[0]!.url.href);
      return yield* provider.fetch(source, ref);
    });
  },
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

    const localProvider = createLocalSourceHostProvider();
    const gitProvider = createGitSourceHostProvider();
    const builtinProvider = createBuiltinSourceHostProvider();
    const registryMetaProvider = createRegistryMetaProvider();

    // Captured layer for providing to provider operations
    const depLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Workspace, ws),
    );

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
      }
    };

    return {
      find: findImpl as SourceHostProvidersService["find"],
      fetch: (ref) => {
        if (ref.type === "pack") {
          return Effect.fail(
            makeCliError({
              code: "SOURCE_FETCH_FAILED",
              what: "Pack refs are not fetchable by SourceHostProviders",
            }),
          );
        }
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
