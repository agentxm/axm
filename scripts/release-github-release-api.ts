import * as Schema from "effect/Schema";

import type { GitHubReleaseObservation } from "./release-github-release.js";

const RELEASES_PER_PAGE = 100;

const ReleaseInventoryEntry = Schema.Struct({
  id: Schema.Number,
  tag_name: Schema.String,
  target_commitish: Schema.String,
  draft: Schema.Boolean,
  prerelease: Schema.Boolean,
  html_url: Schema.String,
});

const ReleaseInventoryPage = Schema.Array(ReleaseInventoryEntry);

type Release = NonNullable<GitHubReleaseObservation["release"]>;

export const readGitHubReleaseByTag = async (input: {
  readonly tag: string;
  readonly signal: AbortSignal;
  readonly readPage: (page: number, signal: AbortSignal) => Promise<unknown>;
}): Promise<Release | null> => {
  let page = 1;
  while (true) {
    const releases = Schema.decodeUnknownSync(ReleaseInventoryPage)(
      await input.readPage(page, input.signal),
    );
    const release = releases.find((candidate) => candidate.tag_name === input.tag);
    if (release !== undefined) {
      return {
        id: release.id,
        targetCommitish: release.target_commitish,
        draft: release.draft,
        prerelease: release.prerelease,
        url: release.html_url,
      };
    }
    if (releases.length < RELEASES_PER_PAGE) return null;
    page += 1;
  }
};
