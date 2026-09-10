/**
 * Read orchestrator: matches detected packages to readers and collects
 * recommended extension refs into a HashMap keyed by encoded purl.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import type { DetectedPackage, PackageReader } from "./types.js";

const encodePurl = Schema.encodeSync(PackageUrlSchema);

/**
 * Read local recommendations for each detected package using matching readers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readLocalRecommendations = Effect.fn("discover.readLocal")(function* (
  packages: ReadonlyArray<DetectedPackage>,
  readers: ReadonlyArray<PackageReader>,
) {
  const results = yield* Effect.forEach(
    packages,
    (pkg) => {
      const reader = readers.find((r) => r.type === pkg.type);
      if (!reader) return Effect.succeed(Option.none());
      return reader
        .read(pkg)
        .pipe(
          Effect.map((result) =>
            Option.map(result, (refs) => [encodePurl(pkg.purl), refs] as const),
          ),
        );
    },
    { concurrency: "unbounded" },
  );

  return HashMap.fromIterable(Array.getSomes(results));
});
