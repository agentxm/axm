import { ArtifactHttpClient } from "./http-download.js";
import { createHttpSourceHostProvider } from "./providers/http.js";
/**
 * Environment-backed Live layers for `SourceHostProviders` and the workspace
 * catalog port.
 *
 * Composed only at the application composition root: the providers layer
 * captures the platform services and the workspace catalog and official AXM
 * skill gate ports once and hides them behind the service interface.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { RegistryClientFactory } from "@agentxm/registry-client";
import { fromFileLocation } from "@agentxm/host-primitives";
import type * as Scope from "effect/Scope";

import {
  acquiredPackageRelativePath,
  LockfileReader,
  WorkspaceLocation,
  retainedPackageBindings,
  retainedPackageKeyForRef,
  computeExtensionPathsForLayout,
  computeMaterializedTreeIntegrity,
} from "../workspace-state/index.js";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { AcquiredSourceFiles } from "./service.js";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { AxmSkillCandidateGate } from "./axm-skill-gate.js";
import { RegistryResolutionPolicy } from "./registry-resolution-policy.js";
import {
  SourceNetworkFailure,
  SourceNotResolvable,
  type SourceResolutionFailure,
} from "./errors.js";
import { createGitSourceHostProvider } from "./providers/git.js";
import { createLocalSourceHostProvider } from "./providers/local.js";
import {
  buildCloneUrlFromSource,
  createRegistryMetaProvider,
  getOriginFromSource,
  SourceHostProviders,
} from "./service.js";
import type { SourceHostProvidersService } from "./service.js";
import { WorkspaceCatalog } from "./workspace-catalog.js";
import { GitDirectoryComparison } from "./git/directory-comparison.js";
import { compareDirectoryToHead } from "./git/operations.js";
import { findGitRoot } from "./git/detect.js";
import {
  acquiredFilesForRef,
  DirectoryCopyLimitExceeded,
  copyExtensionDirectory,
} from "../acquisition/index.js";

export { WorkspaceCatalogLive } from "./workspace-catalog-live.js";

/** Select the project anchor only when the local path is contained by it. */
export const localRefSourcePath = (
  path: Path.Path,
  workspaceRoot: string,
  selectedPath: string,
): string => {
  const relative = Option.map(
    makeWorkspaceRelativeSourcePath(path, workspaceRoot, selectedPath),
    (value) => value.split(path.sep).join("/"),
  );
  return Option.isSome(relative) && relative.value !== ".." && !relative.value.startsWith("../")
    ? relative.value
    : selectedPath.split(path.sep).join("/");
};

// -----------------------------------------------------------------------------
// Layer
// -----------------------------------------------------------------------------

/**
 * Live layer for SourceHostProviders.
 *
 * Constructs the provider registry with all source type providers.
 * Captures FileSystem, Path, the Registry client port, the WorkspaceCatalog port, the
 * AxmSkillCandidateGate port, and the RegistryResolutionPolicy port at
 * creation time so the service interface doesn't leak these dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceHostProvidersLive: Layer.Layer<
  SourceHostProviders,
  never,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceCatalog
  | AxmSkillCandidateGate
  | RegistryResolutionPolicy
  | RegistryClientFactory
  | ArtifactHttpClient
> = Layer.effect(
  SourceHostProviders,
  Effect.gen(function* () {
    const artifactClient = yield* ArtifactHttpClient;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const catalog = yield* WorkspaceCatalog;
    const axmSkillGate = yield* AxmSkillCandidateGate;
    const resolutionPolicy = yield* RegistryResolutionPolicy;
    const registryClients = yield* RegistryClientFactory;

    const httpProvider = createHttpSourceHostProvider();
    const localProvider = createLocalSourceHostProvider();
    const gitProvider = createGitSourceHostProvider();
    const registryMetaProvider = createRegistryMetaProvider();

    // Captured layer for providing to provider operations
    const depLayer = Layer.mergeAll(
      Layer.succeed(ArtifactHttpClient, artifactClient),
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(AxmSkillCandidateGate, axmSkillGate),
      Layer.succeed(RegistryResolutionPolicy, resolutionPolicy),
      Layer.succeed(RegistryClientFactory, registryClients),
    );

    const localSourceForWorkspace = (source: Extract<Source, { readonly type: "local" }>) => ({
      ...source,
      path: path.isAbsolute(source.path)
        ? source.path
        : path.resolve(catalog.workspaceRoot, source.path),
    });

    const normalizeLocalRefSourcePath = <TRef extends ExtensionRef>(
      ref: TRef,
    ): Effect.Effect<TRef, SourceNotResolvable> => {
      if (ref.refType !== "local") return Effect.succeed(ref);
      const selectedPath = fromFileLocation(ref.location);
      const sourcePath = localRefSourcePath(path, catalog.workspaceRoot, selectedPath);
      const normalized = { ...ref, sourcePath };
      return ref.type === "pack"
        ? Effect.map(
            Effect.forEach(ref.sourceMembers, normalizeLocalRefSourcePath),
            (sourceMembers) => ({ ...normalized, sourceMembers }),
          )
        : Effect.succeed(normalized);
    };

    const findImpl = (source: Source, options: FindOptions) => {
      switch (source.type) {
        case "http":
          return httpProvider.find(source, options).pipe(Effect.provide(depLayer));
        case "local":
          return localProvider.find(localSourceForWorkspace(source), options).pipe(
            Effect.provide(depLayer),
            Effect.flatMap((refs) => Effect.forEach(refs, normalizeLocalRefSourcePath)),
          );
        case "git":
          return gitProvider.find(source, options).pipe(Effect.provide(depLayer));
        case "registry":
          return registryMetaProvider.find(source, options).pipe(Effect.provide(depLayer));
        case "workspace":
          return Effect.fail(
            new SourceNotResolvable({
              category: "validation",
              detail:
                "Workspace sources resolve from their canonical package through the workspace configured-entry resolver",
            }),
          );
      }
    };

    const fetchImpl = (
      source: Source,
      ref: ExtensionRef,
    ): Effect.Effect<AcquiredSourceFiles, SourceResolutionFailure, Scope.Scope> => {
      switch (source.type) {
        case "http":
          return httpProvider.fetch(source, ref).pipe(Effect.provide(depLayer));
        case "local":
          return localProvider.fetch(source, ref).pipe(Effect.provide(depLayer));
        case "git":
          return gitProvider.fetch(source, ref).pipe(Effect.provide(depLayer));
        case "registry":
          return registryMetaProvider.fetch(source, ref).pipe(Effect.provide(depLayer));
        case "workspace":
          return Effect.fail(
            new SourceNotResolvable({
              category: "validation",
              detail:
                "Workspace source files are read directly from their canonical package and are not fetched through a source host provider",
            }),
          );
      }
    };

    const validatePlacement = <TRef extends ExtensionRef>(
      ref: TRef,
    ): Effect.Effect<TRef, SourceNotResolvable> =>
      ref.refType === "workspace"
        ? Effect.succeed(ref)
        : Effect.fromResult(
            acquiredPackageRelativePath(ref, toExtensionTypePlural(ref.type), ref.name),
          ).pipe(
            Effect.mapError(
              (cause) => new SourceNotResolvable({ category: "validation", detail: cause.detail }),
            ),
            Effect.as(ref),
          );

    const service: SourceHostProvidersService = {
      find: (source, options) =>
        findImpl(source, options).pipe(
          Effect.flatMap((refs) => Effect.forEach(refs, validatePlacement)),
          Effect.withSpan("SourceHostProviders.find"),
        ),
      resolveNamedRegistry: (source, options) =>
        registryMetaProvider.resolveNamed(source, options).pipe(
          Effect.provide(depLayer),
          Effect.tap((selection) =>
            "ref" in selection ? validatePlacement(selection.ref) : Effect.void,
          ),
          Effect.withSpan("SourceHostProviders.resolveNamedRegistry"),
        ),
      acquireForTransition: (ref) =>
        Effect.gen(function* () {
          yield* validatePlacement(ref);
          const retained =
            ref.refType !== "http" && ref.refType !== "git-hosted"
              ? undefined
              : yield* Effect.gen(function* () {
                  const reader = yield* Effect.serviceOption(LockfileReader);
                  const workspace = yield* Effect.serviceOption(WorkspaceLocation);
                  if (Option.isNone(reader) || Option.isNone(workspace)) return undefined;
                  const lock = yield* reader.value.lockfile.pipe(
                    Effect.mapError(
                      (cause) =>
                        new SourceNotResolvable({
                          category: "validation",
                          detail: "Accepted package could not be read",
                          cause,
                        }),
                    ),
                  );
                  const binding = retainedPackageBindings(lock).find(
                    (entry) => entry.packageKey === retainedPackageKeyForRef(ref),
                  );
                  if (
                    binding === undefined ||
                    (ref.refType === "http"
                      ? JSON.stringify(binding.entry.resolved) !== JSON.stringify(ref.snapshot)
                      : !("commit" in binding.entry.resolved) ||
                        binding.entry.resolved.commit !== ref.gitCommitSha ||
                        binding.entry.resolved.tree !== ref.gitTreeSha)
                  )
                    return undefined;
                  const layout = yield* Ref.get(workspace.value.layout);
                  const canonicalPath = computeExtensionPathsForLayout(
                    path.join,
                    layout,
                    ref,
                    "skills",
                    ref.name,
                  ).canonicalPath;
                  const componentPath = ref.distribution?.componentPath ?? ".";
                  if (
                    path.resolve(fromFileLocation(ref.location)) !==
                    path.resolve(canonicalPath, componentPath)
                  )
                    return undefined;
                  const integrity = yield* Effect.option(
                    computeMaterializedTreeIntegrity(canonicalPath).pipe(Effect.provide(depLayer)),
                  );
                  if (Option.isNone(integrity) || integrity.value !== binding.entry.treeIntegrity)
                    return undefined;
                  return {
                    directory: path.join(canonicalPath, componentPath),
                    packageDirectory: canonicalPath,
                    componentPath,
                  };
                });
          const files = retained ?? (yield* fetchImpl(ref.source, ref));
          if (ref.refType !== "local" && retained === undefined) return files;
          // Path sources are mutable. The transition consumes captured bytes,
          // while its normal under-lock freshness check still covers the path.
          const directory = yield* Effect.acquireRelease(
            fs.makeTempDirectory({ prefix: "axm-acquired-path-" }).pipe(
              Effect.mapError(
                (cause) =>
                  new SourceNetworkFailure({
                    detail: "Temporary path-source directory could not be created",
                    cause,
                  }),
              ),
            ),
            (scratch) => fs.remove(scratch, { recursive: true }).pipe(Effect.ignore),
          );
          yield* copyExtensionDirectory(files.packageDirectory ?? files.directory, directory).pipe(
            Effect.provide(depLayer),
            Effect.mapError((cause) =>
              cause instanceof DirectoryCopyLimitExceeded
                ? new SourceNotResolvable({
                    category: "validation",
                    detail: `Path-source content exceeds the ${cause.limit} ${cause.resource} copy limit`,
                    cause,
                  })
                : new SourceNetworkFailure({
                    detail: "Path-source content could not be captured",
                    cause,
                  }),
            ),
          );
          return files.componentPath === undefined
            ? { directory, scratchRoot: directory }
            : {
                directory: path.join(directory, files.componentPath),
                packageDirectory: directory,
                componentPath: files.componentPath,
                scratchRoot: directory,
              };
        }).pipe(Effect.withSpan("SourceHostProviders.acquireForTransition")),
      // A fetch under the workspace transition is remote retrieval: it
      // consumes the acquired tree, and the transition refuses any the plan
      // did not select.
      fetch: (ref) =>
        acquiredFilesForRef(ref, "remote").pipe(
          Effect.mapError(
            (cause) =>
              new SourceNotResolvable({ category: "internal", detail: cause.detail, cause }),
          ),
          Effect.flatMap(
            Option.match({
              onNone: () => fetchImpl(ref.source, ref),
              onSome: (files) => Effect.succeed(files),
            }),
          ),
          Effect.provideService(Path.Path, path),
          Effect.withSpan("SourceHostProviders.fetch"),
        ),
      cloneUrl: buildCloneUrlFromSource,
      origin: getOriginFromSource,
    };

    return service;
  }),
);

/** Live local-Git comparison service. */
export const GitDirectoryComparisonLive: Layer.Layer<
  GitDirectoryComparison,
  never,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  GitDirectoryComparison,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const platform = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    return {
      compare: ({ directory, currentPaths }) =>
        findGitRoot(directory).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none()),
              onSome: (repositoryRoot) =>
                compareDirectoryToHead(repositoryRoot, directory, currentPaths).pipe(
                  Effect.map(Option.some),
                ),
            }),
          ),
          Effect.provide(platform),
        ),
    };
  }),
);
