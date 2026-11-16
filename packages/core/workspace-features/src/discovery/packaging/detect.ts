/**
 * Detect orchestrator: runs all package detectors concurrently,
 * flattens results, and deduplicates by purl equivalence.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { sharedListing } from "./reader-io.js";
import type { PackageDetector, ProjectEntries } from "./types.js";

const purlEquivalence = Schema.toEquivalence(PackageUrlPartsSchema);

/**
 * One detection's listing of `projectDir`: it runs when a detector first asks
 * and every detector of the detection shares its frozen entries, or the same
 * `none` when listing fails. Concurrent askers await one listing, and a
 * listing every asker abandoned is not kept.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const listProjectEntries = (projectDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries: ProjectEntries = yield* Effect.cached(
      fs.readDirectory(projectDir).pipe(Effect.map(sharedListing), Effect.option),
    );
    return entries;
  });

/**
 * Run all detectors concurrently, flatten and deduplicate results.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectPackages = Effect.fn("discover.detect")(function* (
  projectDir: string,
  detectors: ReadonlyArray<PackageDetector>,
) {
  const projectEntries = yield* listProjectEntries(projectDir);
  const results = yield* Effect.forEach(detectors, (d) => d.detect(projectDir, projectEntries), {
    concurrency: 16,
  });
  const allDetected = Array.flatten(results);
  return Array.dedupeWith(
    allDetected,
    (a, b) =>
      purlEquivalence(a.purl, b.purl) &&
      a.resolution?.state === b.resolution?.state &&
      (a.resolution?.state !== "resolved" ||
        (b.resolution?.state === "resolved" &&
          a.resolution.metadataPath === b.resolution.metadataPath)),
  );
});
