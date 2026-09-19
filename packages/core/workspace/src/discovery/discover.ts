/**
 * Discover pipeline: detect direct packages, read package-native extension
 * declarations, submit them to the registry, and render attestation results.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { RegistryClientFactoryService } from "@agentxm/registry-client";
import type {
  DiscoveryExtensionResult,
  DiscoveryResolvedExtension,
} from "@agentxm/registry-protocol/unstable/registry/discover-schema";
import { detectPackages } from "./packaging/detect.js";
import { packageDetectors, packageReaders } from "./packaging/index.js";
import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";
import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { readLocalRecommendations } from "./packaging/read.js";
import {
  AGENTXM_REGISTRY_URL,
  type AgentExtensionRecommendation,
  type AgentExtensionSource,
} from "@agentxm/extension-model/unstable/recommendations/agent-extensions";
import type { GitSource, LocalSource } from "@agentxm/extension-model/unstable/sources/types";
import { findLocalOrGitExtensionPackagesFromSource } from "../resolution/sources/package-sources.js";

export interface DiscoverResultEntry {
  readonly ref: string;
  readonly source: AgentExtensionSource;
  readonly resolved: boolean;
  readonly extension: DiscoveryExtensionResult["extension"];
  readonly attestedBy: ReadonlyArray<"package" | "extension">;
  readonly official: boolean;
  readonly packageVersionInRange: boolean;
}

export interface DiscoverPackageResult {
  readonly detectedPackage: PackageUrlParts;
  readonly extensions: ReadonlyArray<DiscoverResultEntry>;
}

export interface DiscoverResult {
  readonly packages: ReadonlyArray<DiscoverPackageResult>;
  readonly totalDetected: number;
  readonly registryAvailable: boolean;
}

const encodePurl = Schema.encodeSync(PackageUrlSchema);

const packageIdentity = (parts: PackageUrlParts): PackageUrlParts => ({
  type: parts.type,
  name: parts.name,
  ...(parts.namespace === undefined ? {} : { namespace: parts.namespace }),
  ...(parts.qualifiers === undefined ? {} : { qualifiers: parts.qualifiers }),
  ...(parts.subpath === undefined ? {} : { subpath: parts.subpath }),
});

const extensionDeclarationToRef = (value: AgentExtensionRecommendation): string | undefined => {
  const parts = parseExtensionFqnParts(value.ref);
  if (parts === undefined) {
    return undefined;
  }
  return `${parts.owner}/${toExtensionTypePlural(parts.type)}/${parts.name}`;
};

interface DeclaredRecommendation {
  readonly declaration: AgentExtensionRecommendation;
  readonly ref: string;
  readonly source: AgentExtensionSource;
}

interface DeclaredPackage {
  readonly detectedPackage: PackageUrlParts;
  readonly identity: PackageUrlParts;
  readonly identityPurl: string;
  readonly version: string;
  readonly recommendations: ReadonlyArray<DeclaredRecommendation>;
}

const normalizedSource = (declaration: AgentExtensionRecommendation): AgentExtensionSource =>
  declaration.source ?? { type: "registry", url: new URL(AGENTXM_REGISTRY_URL) };

const unresolvedEntry = (recommendation: DeclaredRecommendation): DiscoverResultEntry => ({
  ref: recommendation.ref,
  source: recommendation.source,
  resolved: false,
  extension: undefined,
  attestedBy: ["package"],
  official: false,
  packageVersionInRange: true,
});

const resolvedLocalEntry = (input: {
  readonly recommendation: DeclaredRecommendation;
  readonly source: Exclude<AgentExtensionSource, { readonly type: "registry" }>;
  readonly identity: {
    readonly owner: DiscoveryResolvedExtension["owner"];
    readonly type: DiscoveryResolvedExtension["type"];
    readonly name: DiscoveryResolvedExtension["name"];
  };
}): DiscoverResultEntry => {
  const common = {
    ref: input.recommendation.ref,
    resolved: true,
    attestedBy: ["package"],
    official: false,
    packageVersionInRange: true,
  } satisfies Omit<DiscoverResultEntry, "source" | "extension">;
  switch (input.source.type) {
    case "git":
      return {
        ...common,
        source: input.source,
        extension: { ...input.identity, resolution: input.source },
      };
    case "path":
      return {
        ...common,
        source: input.source,
        extension: { ...input.identity, resolution: input.source },
      };
  }
};

const toResolutionSource = (
  source: Exclude<AgentExtensionSource, { readonly type: "registry" }>,
  projectDir: string,
  path: Path.Path,
): GitSource | LocalSource => {
  switch (source.type) {
    case "git":
      return {
        type: "git",
        url: source.url,
        ref: Option.fromUndefinedOr(source.revision),
        subPath: Option.fromUndefinedOr(source.path),
      };
    case "path":
      return { type: "local", path: path.resolve(projectDir, source.path) };
  }
};

export const discover = (projectDir: string, registryFactory: RegistryClientFactoryService) =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const detected = yield* detectPackages(projectDir, packageDetectors).pipe(
        Effect.withSpan("discover.detect"),
      );

      if (detected.length === 0) {
        return {
          packages: [],
          totalDetected: 0,
          registryAvailable: true,
        } satisfies DiscoverResult;
      }

      const localExtensions = yield* readLocalRecommendations(detected, packageReaders).pipe(
        Effect.withSpan("discover.readLocal"),
      );

      const declaredPackages = detected.flatMap((pkg): ReadonlyArray<DeclaredPackage> => {
        if (pkg.purl.version === undefined) {
          return [];
        }

        const purl = encodePurl(pkg.purl);
        const declarations = Option.match(HashMap.get(localExtensions, purl), {
          onNone: (): ReadonlyArray<AgentExtensionRecommendation> => [],
          onSome: (value) => value,
        });
        const recommendations = declarations.flatMap((declaration) => {
          const ref = extensionDeclarationToRef(declaration);
          return ref === undefined
            ? []
            : [{ declaration, ref, source: normalizedSource(declaration) }];
        });

        if (recommendations.length === 0) {
          return [];
        }

        const identity = packageIdentity(pkg.purl);
        return [
          {
            detectedPackage: pkg.purl,
            identity,
            identityPurl: encodePurl(identity),
            version: pkg.purl.version,
            recommendations,
          },
        ];
      });

      const registryLocations = [
        ...new Set(
          declaredPackages.flatMap((pkg) =>
            pkg.recommendations.flatMap((entry) =>
              entry.source.type === "registry" ? [entry.source.url.href] : [],
            ),
          ),
        ),
      ];

      const registryQueries = yield* Effect.forEach(
        registryLocations,
        (location) =>
          Effect.gen(function* () {
            const client = yield* registryFactory.forLocation(location);
            const packages = declaredPackages.flatMap((pkg) => {
              const declaredExtensions = pkg.recommendations
                .filter(
                  (entry) => entry.source.type === "registry" && entry.source.url.href === location,
                )
                .map((entry) => entry.declaration);
              return declaredExtensions.length === 0
                ? []
                : [{ purl: pkg.identity, version: pkg.version, declaredExtensions }];
            });
            const result = yield* Effect.result(client.discoverPackages({ packages }));
            if (Result.isFailure(result)) {
              yield* Effect.logWarning(
                "Registry source is unreachable; recommendations remain unresolved",
              ).pipe(Effect.annotateLogs({ registry: location }));
            }
            return { location, result };
          }).pipe(Effect.withSpan("discover.queryRegistry")),
        { concurrency: 4 },
      );

      const resolveRegistryRecommendation = (
        pkg: DeclaredPackage,
        recommendation: DeclaredRecommendation,
      ): DiscoverResultEntry => {
        if (recommendation.source.type !== "registry") {
          return unresolvedEntry(recommendation);
        }
        const location = recommendation.source.url.href;
        const query = registryQueries.find((candidate) => candidate.location === location);
        if (query === undefined || Result.isFailure(query.result)) {
          return unresolvedEntry(recommendation);
        }
        const packageResult = query.result.success.results.find(
          (candidate) => candidate.purl === pkg.identityPurl,
        );
        const extension = packageResult?.extensions.find(
          (candidate) => candidate.ref === recommendation.ref,
        );
        return extension === undefined
          ? unresolvedEntry(recommendation)
          : {
              ref: extension.ref,
              source: recommendation.source,
              resolved: extension.resolved,
              extension: extension.extension,
              attestedBy: extension.attestedBy,
              official: extension.official,
              packageVersionInRange: extension.packageVersionInRange,
            };
      };

      const packages = yield* Effect.forEach(declaredPackages, (pkg) =>
        Effect.gen(function* () {
          const extensions = yield* Effect.forEach(
            pkg.recommendations,
            (recommendation) => {
              if (recommendation.source.type === "registry") {
                return Effect.succeed(resolveRegistryRecommendation(pkg, recommendation));
              }
              const source = recommendation.source;
              const parts = parseExtensionFqnParts(recommendation.ref);
              if (parts === undefined) {
                return Effect.succeed(unresolvedEntry(recommendation));
              }
              const resolutionSource = toResolutionSource(source, projectDir, path);
              return Effect.result(
                findLocalOrGitExtensionPackagesFromSource(resolutionSource, {
                  names: [parts.name],
                  owner: Option.some(parts.owner),
                  type: parts.type,
                }),
              ).pipe(
                Effect.map((resolution) => {
                  if (Result.isFailure(resolution)) {
                    return unresolvedEntry(recommendation);
                  }
                  const candidate = resolution.success[0];
                  return candidate === undefined
                    ? unresolvedEntry(recommendation)
                    : resolvedLocalEntry({
                        recommendation,
                        source,
                        identity: {
                          owner: candidate.identity.owner,
                          type: candidate.identity.type,
                          name: candidate.identity.name,
                        },
                      });
                }),
              );
            },
            { concurrency: 1 },
          );
          return {
            detectedPackage: pkg.detectedPackage,
            extensions,
          } satisfies DiscoverPackageResult;
        }),
      );

      const registryAvailable = registryQueries.every((query) => Result.isSuccess(query.result));

      return {
        packages,
        totalDetected: detected.length,
        registryAvailable,
      } satisfies DiscoverResult;
    }),
  ).pipe(Effect.annotateLogs({ command: "discover", projectDir }), Effect.withSpan("discover"));
