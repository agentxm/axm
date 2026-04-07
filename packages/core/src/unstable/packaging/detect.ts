/**
 * Detect orchestrator: runs all package detectors concurrently,
 * flattens results, and deduplicates by purl equivalence.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PackageUrlPartsSchema } from "./package-url.js";
import type { PackageDetector } from "./types.js";

const purlEquivalence = Schema.toEquivalence(PackageUrlPartsSchema);

/**
 * Run all detectors concurrently, flatten and deduplicate results.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectPackages = Effect.fn("discover.detect")(function* (
  projectDir: string,
  detectors: ReadonlyArray<PackageDetector>,
) {
  const results = yield* Effect.forEach(detectors, (d) => d.detect(projectDir), {
    concurrency: "unbounded",
  });
  const allDetected = Array.flatten(results);
  return Array.dedupeWith(allDetected, (a, b) => purlEquivalence(a.purl, b.purl));
});
