/**
 * SourceHostProviders Effect service.
 *
 * Provides a unified interface for discovering and fetching extensions
 * across all source types, plus clone URL and source display building.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import { parseRegistrySourcePatternParts } from "@agentxm/extension-model/unstable/extensions";
import type { SourceResolutionFailure } from "./errors.js";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  ExtensionFiles,
  FindOptions,
  NamedRegistryFindOptions,
  NamedRegistryResolution,
} from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { RegistrySource, Source } from "@agentxm/extension-model/unstable/sources/types";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { createRegistrySourceHostProviderFromHost } from "./providers/registry/host-provider.js";
import { buildCloneUrlForSource } from "./providers/git-hosting.js";

// -----------------------------------------------------------------------------
// Service Interface
// -----------------------------------------------------------------------------

/**
 * Service interface for source host providers.
 *
 * Dependencies (FileSystem, Path, WorkspaceCatalog) are resolved at layer creation —
 * callers only see the service, not its implementation details.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SourceHostProvidersService {
  /** Find extensions matching the given source and search criteria. */
  readonly find: (
    source: Source,
    options: FindOptions,
  ) => Effect.Effect<ReadonlyArray<ExtensionRef>, SourceResolutionFailure, Scope.Scope>;
  /** Resolve one explicit Registry target with a typed selection outcome. */
  readonly resolveNamedRegistry: (
    source: RegistrySource,
    options: NamedRegistryFindOptions,
  ) => Effect.Effect<NamedRegistryResolution, SourceResolutionFailure, Scope.Scope>;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (
    ref: ExtensionRef,
  ) => Effect.Effect<ExtensionFiles, SourceResolutionFailure, Scope.Scope>;
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
>()("@agentxm/extension-sources/service/SourceHostProviders") {}

// -----------------------------------------------------------------------------
// Clone URL Building
// -----------------------------------------------------------------------------

/**
 * Build a git clone URL from a source.
 * Returns Some for git-based hosting sources, None for others.
 *
 * @internal
 */
export const buildCloneUrlFromSource = (source: Source): Option.Option<string> => {
  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
    case "azurerepos":
      return Option.some(buildCloneUrlForSource(source));
    case "git":
    case "registry":
    case "local":
    case "workspace":
      return Option.none();
  }
};

// -----------------------------------------------------------------------------
// Origin Building
// -----------------------------------------------------------------------------

/**
 * Get the canonical source string for display/comparison.
 *
 * @internal
 */
export const getOriginFromSource = (source: Source): string => {
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
    case "workspace":
      return printSourceParams(source);
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

  resolveNamed: (source: RegistrySource, options: NamedRegistryFindOptions) =>
    Effect.gen(function* () {
      const provider = yield* createRegistrySourceHostProviderFromHost(source);
      const registrySource: RegistrySource = { ...source, owner: Option.some(options.owner) };
      return yield* provider.resolveNamed(registrySource, options);
    }),

  fetch: (source: RegistrySource, ref: ExtensionRef) =>
    Effect.flatMap(createRegistrySourceHostProviderFromHost(source), (provider) =>
      provider.fetch(source, ref),
    ),
});
