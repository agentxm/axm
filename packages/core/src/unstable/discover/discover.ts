/**
 * Discover pipeline: detect packages, read local recommendations,
 * query registry, and merge results with signal assignment.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  parseFullyQualifiedRefParts,
  toExtensionTypePlural,
  type FullyQualifiedRef,
} from "../extensions/common.js";
import type { RegistryClient } from "../registry/client.js";
import type {
  DiscoverExtensionEntry,
  DiscoverExtensionsResponse,
} from "../registry/discover-schema.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { detectPackages } from "../packaging/detect.js";
import { packageDetectors, packageReaders } from "../packaging/index.js";
import type { PackageUrlParts } from "../packaging/package-url.js";
import { PackageUrlSchema } from "../packaging/package-url.js";
import { readLocalRecommendations } from "../packaging/read.js";

// -----------------------------------------------------------------------------
// Result Types
// -----------------------------------------------------------------------------

export type DiscoverSignal = "compatible" | "recommended";

export interface DiscoverResultEntry {
  readonly extension: DiscoverExtensionEntry;
  readonly signal: DiscoverSignal;
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

// -----------------------------------------------------------------------------
// Pipeline
// -----------------------------------------------------------------------------

/**
 * Run the full discover pipeline:
 * 1. Detect packages from project manifests
 * 2. Read local recommendation metadata
 * 3. Query registry for compatible extensions
 * 4. Merge and assign signals
 */
export const discover = (projectDir: string, registryClient: RegistryClient) =>
  Effect.gen(function* () {
    // Stage 1: Detect packages
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

    // Stage 2: Read local recommendations
    const localRecs = yield* readLocalRecommendations(detected, packageReaders).pipe(
      Effect.withSpan("discover.readLocal"),
    );

    // Collect all recommendation refs for the registry query
    const allRecommendedRefs = Array.dedupe(
      Array.flatten(Array.fromIterable(HashMap.values(localRecs))),
    );

    // Stage 3: Query registry
    const purls = detected.map((d) => d.purl);
    const discoverArgs =
      allRecommendedRefs.length > 0
        ? { packages: purls, workspaceRecommendedExtensions: allRecommendedRefs }
        : { packages: purls };

    const registryResult = yield* Effect.result(
      registryClient.discoverExtensions(discoverArgs),
    ).pipe(Effect.withSpan("discover.queryRegistry"));

    if (Result.isFailure(registryResult)) {
      yield* Effect.logWarning("Registry is unreachable — showing local recommendations only");
    }

    const registryAvailable = Result.isSuccess(registryResult);

    // Stage 4: Merge and assign signals
    const merged = mergeResults(
      detected.map((d) => ({ purlString: encodePurl(d.purl), parts: d.purl })),
      registryAvailable ? registryResult.success : undefined,
      localRecs,
    );

    return {
      packages: merged,
      totalDetected: detected.length,
      registryAvailable,
    } satisfies DiscoverResult;
  }).pipe(Effect.annotateLogs({ command: "discover", projectDir }), Effect.withSpan("discover"));

// -----------------------------------------------------------------------------
// Merge Logic
// -----------------------------------------------------------------------------

const makeEntryKey = (entry: DiscoverExtensionEntry): string =>
  `${entry.owner}/${entry.type}/${entry.name}`;

const mergeResults = (
  detected: ReadonlyArray<{ readonly purlString: string; readonly parts: PackageUrlParts }>,
  response: DiscoverExtensionsResponse | undefined,
  localRecs: HashMap.HashMap<string, ReadonlyArray<FullyQualifiedRef>>,
): ReadonlyArray<DiscoverPackageResult> => {
  if (response === undefined) {
    return buildLocalOnlyResults(detected, localRecs);
  }

  // Build a set of recommended extension keys from resolvedRecommendations
  const recommendedKeys = new Set<string>();
  for (const rec of response.resolvedRecommendations) {
    recommendedKeys.add(makeEntryKey(rec));
  }

  // Build per-package results from registry response
  const packageMap = new Map<string, Map<string, DiscoverResultEntry>>();

  for (const group of response.results) {
    const purlParts = group.detectedPackage;
    const purlKey = encodePurl(purlParts);
    let entries = packageMap.get(purlKey);
    if (entries === undefined) {
      entries = new Map();
      packageMap.set(purlKey, entries);
    }

    const localRefsForPurl = HashMap.get(localRecs, purlKey);

    for (const ext of group.extensions) {
      const key = makeEntryKey(ext);
      const isRecommended =
        recommendedKeys.has(key) ||
        (Option.isSome(localRefsForPurl) && hasMatchingRef(localRefsForPurl.value, ext));

      const signal: DiscoverSignal = isRecommended ? "recommended" : "compatible";
      const existing = entries.get(key);

      // recommended overrides compatible
      if (
        existing === undefined ||
        (signal === "recommended" && existing.signal === "compatible")
      ) {
        entries.set(key, { extension: ext, signal });
      }
    }
  }

  // Also add resolvedRecommendations that may not appear in results
  for (const rec of response.resolvedRecommendations) {
    const key = makeEntryKey(rec);
    HashMap.forEach(localRecs, (refs, purl) => {
      if (hasMatchingRef(refs, rec)) {
        let entries = packageMap.get(purl);
        if (entries === undefined) {
          entries = new Map();
          packageMap.set(purl, entries);
        }
        const existing = entries.get(key);
        if (existing === undefined || existing.signal === "compatible") {
          entries.set(key, { extension: rec, signal: "recommended" });
        }
      }
    });
  }

  // Map detected packages to results, maintaining order
  const purlToDetected = new Map(detected.map((d) => [d.purlString, d.parts]));
  const results: Array<DiscoverPackageResult> = [];

  for (const [purl, entries] of packageMap) {
    const parts = purlToDetected.get(purl);
    if (parts === undefined) continue;
    results.push({
      detectedPackage: parts,
      extensions: [...entries.values()],
    });
  }

  return results;
};

/**
 * Build results from local recommendations only (when registry is unavailable).
 */
const buildLocalOnlyResults = (
  detected: ReadonlyArray<{ readonly purlString: string; readonly parts: PackageUrlParts }>,
  localRecs: HashMap.HashMap<string, ReadonlyArray<FullyQualifiedRef>>,
): ReadonlyArray<DiscoverPackageResult> => {
  const results: Array<DiscoverPackageResult> = [];
  const fallbackVersion = decodeVersionSync("0.0.0");

  for (const pkg of detected) {
    const refsOpt = HashMap.get(localRecs, pkg.purlString);
    if (Option.isNone(refsOpt) || refsOpt.value.length === 0) continue;

    const extensions: Array<DiscoverResultEntry> = [];
    for (const ref of refsOpt.value) {
      const parsed = parseFullyQualifiedRefParts(ref);
      if (parsed === undefined) continue;

      extensions.push({
        extension: {
          type: parsed.type,
          name: parsed.name,
          owner: parsed.owner,
          description: "",
          latestVersion: fallbackVersion,
        },
        signal: "recommended",
      });
    }

    if (extensions.length > 0) {
      results.push({ detectedPackage: pkg.parts, extensions });
    }
  }

  return results;
};

/**
 * Check if any ref in the array matches the extension entry's FQN pattern.
 */
const hasMatchingRef = (
  refs: ReadonlyArray<FullyQualifiedRef>,
  entry: DiscoverExtensionEntry,
): boolean => {
  const plural = toExtensionTypePlural(entry.type);
  const fqn = `${entry.owner}/${plural}/${entry.name}`;

  for (const ref of refs) {
    const parsed = parseFullyQualifiedRefParts(ref);
    if (parsed === undefined) continue;
    const refFqn = `${parsed.owner}/${toExtensionTypePlural(parsed.type)}/${parsed.name}`;
    if (refFqn === fqn) return true;
  }
  return false;
};
