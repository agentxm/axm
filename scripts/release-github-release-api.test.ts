import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  decodeGitHubReleaseAssetView,
  readGitHubReleaseByTag,
} from "./release-github-release-api.js";

const release = (tag: string, draft = false) => ({
  id: 123,
  tag_name: tag,
  target_commitish: "a".repeat(40),
  draft,
  prerelease: false,
  html_url: `https://example.test/releases/${tag}`,
});

describe("GitHub Release API readback", () => {
  it.effect("discovers draft releases from the authenticated release inventory", () =>
    Effect.gen(function* () {
      const pages: number[] = [];
      expect(
        yield* readGitHubReleaseByTag({
          tag: "cli-v1.2.3",
          readPage: (page) =>
            Effect.sync(() => {
              pages.push(page);
              return [release("cli-v1.2.3", true)];
            }),
        }),
      ).toEqual({
        id: 123,
        targetCommitish: "a".repeat(40),
        draft: true,
        prerelease: false,
        url: "https://example.test/releases/cli-v1.2.3",
      });
      expect(pages).toEqual([1]);
    }),
  );

  it.effect("continues through complete pages until the exact tag is found", () =>
    Effect.gen(function* () {
      const pages: number[] = [];
      const firstPage = Array.from({ length: 100 }, (_, index) => release(`cli-v0.0.${index}`));
      expect(
        yield* readGitHubReleaseByTag({
          tag: "cli-v1.2.3",
          readPage: (page) =>
            Effect.sync(() => {
              pages.push(page);
              return page === 1 ? firstPage : [release("cli-v1.2.3")];
            }),
        }),
      ).toEqual({
        id: 123,
        targetCommitish: "a".repeat(40),
        draft: false,
        prerelease: false,
        url: "https://example.test/releases/cli-v1.2.3",
      });
      expect(pages).toEqual([1, 2]);
    }),
  );

  it.effect("reports an affirmative absence after the final partial page", () =>
    Effect.gen(function* () {
      expect(
        yield* readGitHubReleaseByTag({
          tag: "cli-v1.2.3",
          readPage: () => Effect.succeed([release("cli-v1.2.2")]),
        }),
      ).toBeNull();
    }),
  );
});

describe("GitHub Release asset readback", () => {
  it.effect("decodes the exact target and asset states returned by gh release view", () =>
    Effect.gen(function* () {
      const assets = [
        { name: "axm-linux-x64", state: "uploaded", size: 104_857_600 },
        { name: "checksums.txt", state: "new", size: 0 },
      ];
      expect(
        yield* decodeGitHubReleaseAssetView(
          JSON.stringify({
            targetCommitish: "a".repeat(40),
            assets: assets.map((asset) => ({ ...asset, apiUrl: "https://api.github.com/x" })),
          }),
        ),
      ).toEqual({ targetCommitish: "a".repeat(40), assets });
    }),
  );
});
