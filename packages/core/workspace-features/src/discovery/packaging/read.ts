/**
 * Read orchestrator: matches detected packages to readers and collects
 * recommended extension refs keyed by their detected package observation.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import type { DetectedPackage, PackageReader } from "./types.js";

/**
 * Read local recommendations for each detected package using matching readers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readLocalRecommendations = Effect.fn("discover.readLocal")(function* (
  packages: ReadonlyArray<DetectedPackage>,
  readers: ReadonlyArray<PackageReader>,
) {
  const readerOf = (pkg: DetectedPackage) => readers.find((r) => r.type === pkg.type);
  // Each reader with packages to read opens one read for this call; the inputs
  // its packages share live as long as this call.
  const opened = yield* Effect.forEach(
    Array.dedupeWith(
      packages.flatMap((pkg) => readerOf(pkg) ?? []),
      (left, right) => left === right,
    ),
    (reader) =>
      Effect.map(reader.prepare ?? Effect.succeed(reader.read), (read) => ({ reader, read })),
  );
  const results = yield* Effect.forEach(
    packages,
    (pkg) => {
      const reader = readerOf(pkg);
      const read = opened.find((entry) => entry.reader === reader)?.read;
      if (!read) return Effect.succeed(Option.none());
      return read(pkg).pipe(
        Effect.map((result) => Option.map(result, (refs) => [pkg, refs] as const)),
      );
    },
    { concurrency: 16 },
  );

  return HashMap.fromIterable(Array.getSomes(results));
});
