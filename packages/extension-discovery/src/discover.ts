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
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { RegistryClient } from "@agentxm/registry-client";
import type { DiscoveryExtensionResult } from "@agentxm/registry-protocol/unstable/registry/discover-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { detectPackages } from "./packaging/detect.js";
import { packageDetectors, packageReaders } from "./packaging/index.js";
import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";
import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { readLocalRecommendations } from "./packaging/read.js";
import type { PackageExtensionDeclaration } from "@agentxm/registry-client";

export interface DiscoverResultEntry {
  readonly ref: string;
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

const extensionDeclarationToRef = (value: PackageExtensionDeclaration): string | undefined => {
  const parts = parseExtensionFqnParts(value.ref);
  if (parts === undefined) {
    return undefined;
  }
  return `${parts.owner}/${toExtensionTypePlural(parts.type)}/${parts.name}`;
};

export const discover = (projectDir: string, registryClient: RegistryClient) =>
  Effect.gen(function* () {
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

    // v1 submits direct dependencies only. Revisit transitive submission and
    // privacy-mode filtering together so users get one coherent consent model.
    const submittedPackages = detected.flatMap((pkg) => {
      if (pkg.purl.version === undefined) {
        return [];
      }

      const purl = encodePurl(pkg.purl);
      const declaredExtensions = Option.match(HashMap.get(localExtensions, purl), {
        onNone: (): ReadonlyArray<PackageExtensionDeclaration> => [],
        onSome: (value) => value,
      });

      return [
        {
          purl: packageIdentity(pkg.purl),
          version: pkg.purl.version,
          declaredExtensions,
        },
      ];
    });

    const registryResult = yield* Effect.result(
      registryClient.discoverPackages({ packages: submittedPackages }),
    ).pipe(Effect.withSpan("discover.queryRegistry"));

    if (Result.isFailure(registryResult)) {
      yield* Effect.logWarning("Registry is unreachable; showing local package declarations only");
    }

    const registryAvailable = Result.isSuccess(registryResult);
    const packages = registryAvailable
      ? mergeRegistryResults(detected, registryResult.success.results)
      : buildLocalOnlyResults(detected, localExtensions);

    return {
      packages,
      totalDetected: detected.length,
      registryAvailable,
    } satisfies DiscoverResult;
  }).pipe(Effect.annotateLogs({ command: "discover", projectDir }), Effect.withSpan("discover"));

const mergeRegistryResults = (
  detected: ReadonlyArray<{ readonly purl: PackageUrlParts }>,
  results: ReadonlyArray<{
    readonly purl: string;
    readonly extensions: ReadonlyArray<DiscoveryExtensionResult>;
  }>,
): ReadonlyArray<DiscoverPackageResult> => {
  const detectedByIdentity = new Map(
    detected.map((pkg) => [encodePurl(packageIdentity(pkg.purl)), pkg.purl]),
  );

  return results.flatMap((result) => {
    const detectedPackage = detectedByIdentity.get(result.purl);
    if (detectedPackage === undefined || result.extensions.length === 0) {
      return [];
    }

    return [
      {
        detectedPackage,
        extensions: result.extensions.map((entry) => ({
          ref: entry.ref,
          resolved: entry.resolved,
          extension: entry.extension,
          attestedBy: entry.attestedBy,
          official: entry.official,
          packageVersionInRange: entry.packageVersionInRange,
        })),
      },
    ];
  });
};

const buildLocalOnlyResults = (
  detected: ReadonlyArray<{ readonly purl: PackageUrlParts }>,
  localExtensions: HashMap.HashMap<string, ReadonlyArray<PackageExtensionDeclaration>>,
): ReadonlyArray<DiscoverPackageResult> => {
  const fallbackVersion = decodeVersionSync("0.0.0");

  return detected.flatMap((pkg) => {
    const refs = HashMap.get(localExtensions, encodePurl(pkg.purl));
    if (Option.isNone(refs) || refs.value.length === 0) {
      return [];
    }

    const extensions = refs.value.flatMap((entry) => {
      const parts = parseExtensionFqnParts(entry.ref);
      const ref = extensionDeclarationToRef(entry);
      if (parts === undefined || ref === undefined) {
        return [];
      }

      return [
        {
          ref,
          resolved: true,
          extension: {
            owner: parts.owner,
            type: parts.type,
            name: parts.name,
            installVersion: fallbackVersion,
          },
          attestedBy: ["package"],
          official: false,
          packageVersionInRange: true,
        } satisfies DiscoverResultEntry,
      ];
    });

    return extensions.length === 0
      ? []
      : [{ detectedPackage: pkg.purl, extensions } satisfies DiscoverPackageResult];
  });
};
