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
import type {
  ExtensionFiles,
  FindOptions,
  LegacySourceProvider,
  McpServerRef,
  SkillRef,
} from "./provider.js";
import type { SourceExtensionRef, NewSource } from "./types.js";
import {
  createLegacyAzureReposProvider,
  createBitbucketProvider,
  createBuiltinSourceHostProvider,
  createGitHubProvider,
  createGitLabProvider,
  createLegacyGitProvider,
  createLegacyLocalProvider,
  createRegistryProvider,
} from "./providers/index.js";
import type { RegistrySourceInput, Source, SourceInput, SourceType } from "./types.js";
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
  readonly cloneUrl: (source: Source | NewSource) => Option.Option<string>;
  /** Canonical origin string for display/comparison. */
  readonly origin: (source: Source | NewSource) => string;
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
const buildCloneUrlFromSource = (source: Source | NewSource): Option.Option<string> => {
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
const getOriginFromSource = (source: Source | NewSource): string => {
  switch (source.type) {
    case "github":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "gitlab":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "bitbucket":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "azurerepos":
      return `${source.url.origin}/${source.organization}/${source.project}/_git/${source.repo}`;
    case "local":
      return source.path;
    case "git":
      return source.url.href;
    case "registry":
      return "url" in source ? source.url.origin : source.type;
    case "builtin":
      return "builtin";
  }
};

type LegacyRef = SkillRef | McpServerRef;

const toSourceExtensionRef = (ref: LegacyRef): SourceExtensionRef => {
  switch (ref.type) {
    case "skill": {
      const skillBase = {
        type: "skill" as const,
        skill: ref.skill,
        source: ref.source as never,
      };
      switch (ref.source.type) {
        case "registry":
          return {
            ...skillBase,
            version: Option.getOrElse(ref.version, () => ""),
            checksum: "",
            // Preserve legacy location for fetch adapter.
            location: ref.location,
          } as SourceExtensionRef;
        case "local":
          return { ...skillBase, location: ref.location } as SourceExtensionRef;
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return {
            ...skillBase,
            location: ref.location,
            gitTreeSha: ref.gitTreeSha,
          } as SourceExtensionRef;
        default:
          return { ...skillBase, location: ref.location } as SourceExtensionRef;
      }
    }
    case "mcp-server": {
      const serverBase = {
        type: "mcp-server" as const,
        server: { name: ref.name },
        source: ref.source as never,
      };
      switch (ref.source.type) {
        case "registry":
          return {
            ...serverBase,
            version: Option.getOrElse(ref.version, () => ""),
            checksum: "",
            // Preserve legacy location for fetch adapter.
            location: ref.location,
          } as SourceExtensionRef;
        case "local":
          return { ...serverBase, location: ref.location } as SourceExtensionRef;
        case "github":
          return {
            ...serverBase,
            location: ref.location,
            gitTreeSha: Option.none(),
          } as SourceExtensionRef;
        default:
          return { ...serverBase, location: ref.location } as SourceExtensionRef;
      }
    }
  }
};

const toLegacyRef = (ref: Exclude<SourceExtensionRef, { readonly type: "pack" }>): LegacyRef =>
  ref.type === "skill"
    ? {
        type: "skill",
        skill: ref.skill,
        source: ref.source as never,
        location: "location" in ref ? ref.location : "",
        version:
          ref.source.type === "registry"
            ? Option.some("version" in ref ? ref.version : "")
            : Option.none(),
        gitTreeSha: "gitTreeSha" in ref ? ref.gitTreeSha : Option.none(),
      }
    : {
        type: "mcp-server",
        name: ref.server.name,
        source: ref.source as never,
        location: "location" in ref ? ref.location : "",
        version:
          ref.source.type === "registry"
            ? Option.some("version" in ref ? ref.version : "")
            : Option.none(),
      };

// -----------------------------------------------------------------------------
// Registry Meta-Provider
// -----------------------------------------------------------------------------

/**
 * Creates a registry meta-provider that wraps N configured registries
 * into a single `LegacySourceProvider<RegistrySourceInput>`.
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
export const createRegistryMetaProvider = (): LegacySourceProvider<
  RegistrySourceInput,
  FileSystem.FileSystem | Path.Path | Workspace
> => ({
  type: "registry",

  find: (_source, options) =>
    Effect.gen(function* () {
      const ws = yield* Workspace;

      // Determine scope from source (e.g. @scope/name install) or from options names
      const sourceScope = _source.scope ? Option.some(_source.scope) : Option.none<string>();
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
        const empty: ReadonlyArray<LegacyRef> = [];
        return empty;
      }

      // Try each registry source in order. 404 (empty results) → fallthrough.
      // Sequential: early-exits on first non-404 error (can't use Effect.forEach)
      const allRefs: Array<LegacyRef> = [];

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

      return allRefs as ReadonlyArray<LegacyRef>;
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

    const githubProvider = createGitHubProvider();
    const gitlabProvider = createGitLabProvider();
    const bitbucketProvider = createBitbucketProvider();
    const azurereposProvider = createLegacyAzureReposProvider();
    const gitProvider = createLegacyGitProvider();
    const localProvider = createLegacyLocalProvider();
    const registryMetaProvider = createRegistryMetaProvider();

    // Captured layer for providing to provider operations
    const depLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Workspace, ws),
    );

    const builtinProvider = createBuiltinSourceHostProvider();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dispatch table: each key maps to correct provider
    const providers: Record<SourceType, LegacySourceProvider<any, any>> = {
      github: githubProvider,
      gitlab: gitlabProvider,
      bitbucket: bitbucketProvider,
      azurerepos: azurereposProvider,
      git: gitProvider,
      local: localProvider,
      registry: registryMetaProvider,
      // Assertion needed: SourceHostProvider has `match` method but dispatch table expects LegacySourceProvider
      builtin: builtinProvider as unknown as LegacySourceProvider<SourceInput, never>,
    };

    const findImpl = (source: Source, options: FindOptions) =>
      providers[source.type].find(source, options).pipe(
        Effect.provide(depLayer),
        Effect.map((refs) => refs.map((ref) => toSourceExtensionRef(ref))),
      ) as Effect.Effect<ReadonlyArray<SourceExtensionRef>, CliError, Scope.Scope>;

    return {
      find: findImpl as SourceHostProvidersService["find"],
      fetch: (ref) => {
        const source = ref.source;
        if (ref.type === "pack") {
          return Effect.fail(
            makeCliError({
              code: "SOURCE_FETCH_FAILED",
              what: "Pack refs are not fetchable by SourceHostProviders",
            }),
          );
        }
        return providers[source.type]
          .fetch(source, toLegacyRef(ref))
          .pipe(Effect.provide(depLayer)) as Effect.Effect<ExtensionFiles, CliError, Scope.Scope>;
      },
      cloneUrl: buildCloneUrlFromSource,
      origin: getOriginFromSource,
    };
  }),
);
