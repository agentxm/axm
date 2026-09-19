import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import {
  SourceNetworkFailure,
  SourceNotResolvable,
  type SourceResolutionFailure,
} from "./errors.js";
import { shallowClone } from "./git/operations.js";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import { SourceHostProviders } from "./service.js";
import {
  discoverExtensionPackages,
  inspectExtensionPackage,
  isManifestExtensionPackage,
  type DiscoveredManifestExtensionPackage,
  type ExtensionPackageFilter,
} from "./package-discovery.js";

export interface ResolvedExtensionPackage extends DiscoveredManifestExtensionPackage {
  readonly origin: string;
}

export interface AcquiredExternalSource {
  readonly directory: string;
  readonly origin: string;
}

const acquireClone = (
  cloneUrl: string,
  ref: Option.Option<string>,
): Effect.Effect<
  string,
  SourceResolutionFailure,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const tempDir = yield* Effect.acquireRelease(
      fs.makeTempDirectory({ prefix: "axm-source-clone-" }).pipe(
        Effect.mapError(
          (cause) =>
            new SourceNetworkFailure({
              detail: "Temporary package source directory could not be created",
              cause,
            }),
        ),
      ),
      (directory) => fs.remove(directory, { recursive: true }).pipe(Effect.ignore),
    );
    yield* shallowClone(cloneUrl, tempDir, Option.getOrUndefined(ref));
    return tempDir;
  });

/** Acquire a stable local view of a local or Git source for the current scope. */
export const acquireExternalSource = (
  source: Source,
): Effect.Effect<
  AcquiredExternalSource,
  SourceResolutionFailure,
  FileSystem.FileSystem | Path.Path | SourceHostProviders | Scope.Scope
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const providers = yield* SourceHostProviders;
    const origin = providers.origin(source);
    switch (source.type) {
      case "local":
        return { directory: source.path, origin };
      case "git": {
        const cloneRoot = yield* acquireClone(source.url.href, source.ref);
        return {
          directory: Option.match(source.subPath, {
            onNone: () => cloneRoot,
            onSome: (subPath) => path.join(cloneRoot, subPath),
          }),
          origin,
        };
      }
      case "registry":
      case "workspace":
        return yield* new SourceNotResolvable({
          category: "validation",
          detail: "Native import accepts local or Git sources; use fork for managed AXM sources",
        });
    }
  });

/**
 * Discover only manifest-backed AXM packages from a resolved source.
 *
 * Native convention discovery intentionally remains separate so callers can
 * never mistake unmanaged content for a forkable AXM package.
 */
export const findExtensionPackagesFromSource = (
  source: Source,
  filter: ExtensionPackageFilter,
): Effect.Effect<
  ReadonlyArray<ResolvedExtensionPackage>,
  SourceResolutionFailure,
  FileSystem.FileSystem | Path.Path | SourceHostProviders | Scope.Scope
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const providers = yield* SourceHostProviders;
    const origin = providers.origin(source);
    switch (source.type) {
      case "local": {
        const packages = yield* discoverExtensionPackages(source.path, filter);
        return packages
          .filter(isManifestExtensionPackage)
          .map((candidate) => ({ ...candidate, origin }));
      }
      case "git": {
        const cloneRoot = yield* acquireClone(source.url.href, source.ref);
        const discoveryRoot = Option.match(source.subPath, {
          onNone: () => cloneRoot,
          onSome: (subPath) => path.join(cloneRoot, subPath),
        });
        const packages = yield* discoverExtensionPackages(discoveryRoot, filter);
        return packages
          .filter(isManifestExtensionPackage)
          .map((candidate) => ({ ...candidate, origin }));
      }
      case "registry": {
        const refs = yield* providers.find(source, {
          names: filter.names,
          owner: filter.owner,
          type: filter.type,
          versionRange: Option.none(),
        });
        return yield* Effect.forEach(
          refs,
          (ref) =>
            Effect.gen(function* () {
              const files = yield* providers.fetch(ref);
              const candidate = yield* inspectExtensionPackage(files.directory);
              return { ...candidate, origin };
            }),
          { concurrency: 8 },
        );
      }
      case "workspace":
        return yield* new SourceNotResolvable({
          category: "validation",
          detail: "Workspace packages resolve from their canonical managed path",
        });
    }
  });
