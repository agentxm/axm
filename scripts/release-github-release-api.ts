import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

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

const ReleaseAssetView = Schema.Struct({
  targetCommitish: Schema.String,
  assets: Schema.Array(
    Schema.Struct({ name: Schema.String, state: Schema.String, size: Schema.Number }),
  ),
});

export type GitHubReleaseAssetView = typeof ReleaseAssetView.Type;

export const decodeGitHubReleaseAssetView = (value: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseAssetView))(value);

export const readGitHubReleaseByTag = <E, R>(input: {
  readonly tag: string;
  readonly readPage: (page: number) => Effect.Effect<unknown, E, R>;
}) =>
  Effect.gen(function* () {
    let page = 1;
    while (true) {
      const releases = yield* Schema.decodeUnknownEffect(ReleaseInventoryPage)(
        yield* input.readPage(page),
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
  });
