import * as Cache from "effect/Cache";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { GitHubReleaseAssetView } from "./release-github-release-api.js";
import { contentIntegrity } from "./release-publication.js";

export class ReleaseAssetTargetConflict extends Data.TaggedError("ReleaseAssetTargetConflict")<{
  readonly expected: string;
  readonly observed: string;
}> {
  override get message(): string {
    return `GitHub Release target integrity conflict: expected ${this.expected}, observed ${this.observed}.`;
  }
}

/**
 * One reader belongs to one release invocation. Its single cache entry shares
 * only a pending view: zero TTL evicts both successes and failures on completion.
 * Cache owns cancellation, keeping shared work alive until its last reader leaves.
 */
export const makeReleaseAssetReader = <E, R, E2, R2>(input: {
  readonly releaseCommit: string;
  readonly viewRelease: Effect.Effect<GitHubReleaseAssetView, E, R>;
  readonly downloadAsset: (name: string) => Effect.Effect<Uint8Array, E2, R2>;
}) =>
  Effect.gen(function* () {
    const views = yield* Cache.make({
      capacity: 1,
      timeToLive: 0,
      requireServicesAt: "lookup",
      lookup: (_key: "release") => input.viewRelease,
    });
    return (asset: { readonly name: string; readonly size: number }) =>
      Effect.gen(function* () {
        const release = yield* Cache.get(views, "release");
        if (release.targetCommitish !== input.releaseCommit)
          return yield* new ReleaseAssetTargetConflict({
            expected: input.releaseCommit,
            observed: release.targetCommitish,
          });
        const observed = release.assets.find((candidate) => candidate.name === asset.name);
        if (observed === undefined || observed.state !== "uploaded") return null;
        // An uploaded asset is final; a different size is different content.
        if (observed.size !== asset.size) return `size:${observed.size}`;
        return contentIntegrity(yield* input.downloadAsset(asset.name));
      });
  });
