import type { GitHubReleaseAssetView } from "./release-github-release-api.js";
import { contentIntegrity } from "./release-publication.js";

/**
 * Reads a GitHub Release asset's content integrity for immutable publication.
 * An asset counts as present only once the release view reports it uploaded.
 * An uploaded asset of another size is reported as a non-matching value
 * without downloading; otherwise its bytes are downloaded and digested.
 * Concurrent readers share one in-flight release view; a settled view is never
 * reused, so every observation attempt sees fresh state.
 */
export const makeReleaseAssetReader = (input: {
  readonly releaseCommit: string;
  readonly viewRelease: (signal: AbortSignal) => Promise<GitHubReleaseAssetView>;
  readonly downloadAsset: (name: string, signal: AbortSignal) => Promise<Uint8Array>;
}) => {
  let inFlight: Promise<GitHubReleaseAssetView> | undefined;
  const viewRelease = (signal: AbortSignal): Promise<GitHubReleaseAssetView> => {
    if (inFlight !== undefined) return inFlight;
    const view = input.viewRelease(signal).finally(() => {
      if (inFlight === view) inFlight = undefined;
    });
    inFlight = view;
    return view;
  };
  return async (
    asset: { readonly name: string; readonly size: number },
    signal: AbortSignal,
  ): Promise<string | null> => {
    const release = await viewRelease(signal);
    if (release.targetCommitish !== input.releaseCommit)
      throw new Error(
        `GitHub Release target integrity conflict: expected ${input.releaseCommit}, observed ${release.targetCommitish}.`,
      );
    const observed = release.assets.find((candidate) => candidate.name === asset.name);
    if (observed === undefined || observed.state !== "uploaded") return null;
    // An uploaded asset is final; a different size is different content.
    if (observed.size !== asset.size) return `size:${observed.size}`;
    return contentIntegrity(await input.downloadAsset(asset.name, signal));
  };
};
