/**
 * SourceProviders Effect service.
 *
 * Provides a unified interface for discovering and fetching extensions
 * across all source types. Handlers consume this via `yield* SourceProviders`.
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

import type { SettingsError } from "../settings/index.js";
import { Workspace } from "../workspace/service.js";
import type { ExtensionFiles, ExtensionRef, FindOptions, SourceProvider } from "./provider.js";
import { SourceError } from "./provider.js";
import {
  createAzureReposProvider,
  createBitbucketProvider,
  createGitHubProvider,
  createGitLabProvider,
  createGitProvider,
  createLocalProvider,
  createRegistryProvider,
} from "./providers/index.js";
import type { RegistrySourceInput, Source } from "./types.js";

// -----------------------------------------------------------------------------
// Service Interface
// -----------------------------------------------------------------------------

/**
 * Service interface for source providers.
 *
 * Dependencies (FileSystem, Path, Workspace) are resolved at layer creation —
 * callers only see the service, not its implementation details.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SourceProvidersService {
  /** Discover extensions matching the given source and search criteria. */
  readonly resolveExtension: (
    source: Source,
    options: FindOptions,
  ) => Effect.Effect<ReadonlyArray<ExtensionRef>, SourceError | SettingsError, Scope.Scope>;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (ref: ExtensionRef) => Effect.Effect<ExtensionFiles, SourceError, Scope.Scope>;
}

/**
 * Effect service tag for source providers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SourceProviders extends Context.Tag("@axm.sh/cli/SourceProviders")<
  SourceProviders,
  SourceProvidersService
>() {}

// -----------------------------------------------------------------------------
// Registry Meta-Provider
// -----------------------------------------------------------------------------

/**
 * Creates a registry meta-provider that wraps N configured registries
 * into a single `SourceProvider<RegistrySourceInput>`.
 *
 * Reads `workspace.getConfiguredRegistrySources()` lazily on each call — always
 * reflects the current config (including sources added by the registry guard).
 *
 * Applies scope routing:
 * 1. Collect registry sources whose `scopes` includes the target scope
 * 2. If no scope-matched sources, collect catch-all sources (no `scopes` field)
 * 3. Scope-matched and catch-all are mutually exclusive
 * 4. 404 → fallthrough within the set; other errors → hard fail
 *
 * @internal
 */
export const createRegistryMetaProvider = (): SourceProvider<
  RegistrySourceInput,
  FileSystem.FileSystem | Path.Path | Workspace
> => ({
  type: "registry",

  find: (_source, options) =>
    Effect.gen(function* () {
      const ws = yield* Workspace;

      // Determine scope from source (e.g. @scope/name install) or from options names
      const sourceScope = _source.scope
        ? Option.some(_source.scope.startsWith("@") ? _source.scope : `@${_source.scope}`)
        : Option.none<string>();
      const scope = Option.isSome(sourceScope)
        ? sourceScope
        : options.names.length > 0
          ? Option.fromNullable(options.names.find((n) => n.startsWith("@"))?.split("/")[0] ?? null)
          : Option.none<string>();

      const registrySources = yield* ws
        .getConfiguredRegistrySources(scope)
        .pipe(
          Effect.mapError(
            (e) =>
              new SourceError({ message: `Failed to get registry sources: ${e._tag}`, cause: e }),
          ),
        );

      if (registrySources.length === 0) {
        return [] as ReadonlyArray<ExtensionRef>;
      }

      // Try each registry source in order. 404 (empty results) → fallthrough.
      // Sequential: early-exits on first non-404 error (can't use Effect.forEach)
      const allRefs: ExtensionRef[] = [];

      for (const regSource of registrySources) {
        const provider = createRegistryProvider(regSource.url.href);
        const result = yield* provider.find(_source, options).pipe(Effect.either);

        if (result._tag === "Left") {
          // Non-404 errors → hard fail
          return yield* Effect.fail(result.left);
        }

        if (result.right.length > 0) {
          allRefs.push(...result.right);
        }
      }

      return allRefs as ReadonlyArray<ExtensionRef>;
    }),

  fetch: (_source, extension) =>
    Effect.gen(function* () {
      // The extension ref carries its location — determine the provider from that
      const location = extension.location.replace("file://", "");
      const provider = createRegistryProvider(
        location.startsWith("http") ? extension.location : location,
      );
      return yield* provider.fetch(_source, extension);
    }),
});

// -----------------------------------------------------------------------------
// Layer
// -----------------------------------------------------------------------------

/**
 * Live layer for SourceProviders.
 *
 * Constructs the provider registry with all source type providers.
 * Captures FileSystem, Path, and Workspace at creation time so the
 * service interface doesn't leak these dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceProvidersLive: Layer.Layer<
  SourceProviders,
  never,
  FileSystem.FileSystem | Path.Path | Workspace
> = Layer.effect(
  SourceProviders,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const githubProvider = createGitHubProvider();
    const gitlabProvider = createGitLabProvider();
    const bitbucketProvider = createBitbucketProvider();
    const azurereposProvider = createAzureReposProvider();
    const gitProvider = createGitProvider();
    const localProvider = createLocalProvider();
    const registryMetaProvider = createRegistryMetaProvider();

    // Captured layer for providing to provider operations
    const depLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Workspace, ws),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dispatch table: each key maps to correct provider
    const providers: Record<Source["type"], SourceProvider<any, any>> = {
      github: githubProvider,
      gitlab: gitlabProvider,
      bitbucket: bitbucketProvider,
      azurerepos: azurereposProvider,
      git: gitProvider,
      local: localProvider,
      registry: registryMetaProvider,
    };

    return {
      resolveExtension: (source, options) =>
        providers[source.type]
          .find(source, options)
          .pipe(Effect.provide(depLayer)) as Effect.Effect<
          ReadonlyArray<ExtensionRef>,
          SourceError | SettingsError,
          Scope.Scope
        >,
      fetch: (ref) =>
        providers[ref.source.type]
          .fetch(ref.source, ref)
          .pipe(Effect.provide(depLayer)) as Effect.Effect<
          ExtensionFiles,
          SourceError,
          Scope.Scope
        >,
    };
  }),
);
