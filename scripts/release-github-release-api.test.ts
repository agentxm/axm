import { describe, expect, it } from "vitest";

import { readGitHubReleaseByTag } from "./release-github-release-api.js";

const release = (tag: string, draft = false) => ({
  tag_name: tag,
  draft,
  prerelease: false,
  html_url: `https://example.test/releases/${tag}`,
});

describe("GitHub Release API readback", () => {
  it("discovers draft releases from the authenticated release inventory", async () => {
    const pages: number[] = [];
    await expect(
      readGitHubReleaseByTag({
        tag: "cli-v1.2.3",
        signal: AbortSignal.timeout(1_000),
        readPage: async (page) => {
          pages.push(page);
          return [release("cli-v1.2.3", true)];
        },
      }),
    ).resolves.toEqual({
      draft: true,
      prerelease: false,
      url: "https://example.test/releases/cli-v1.2.3",
    });
    expect(pages).toEqual([1]);
  });

  it("continues through complete pages until the exact tag is found", async () => {
    const pages: number[] = [];
    const firstPage = Array.from({ length: 100 }, (_, index) => release(`cli-v0.0.${index}`));
    await expect(
      readGitHubReleaseByTag({
        tag: "cli-v1.2.3",
        signal: AbortSignal.timeout(1_000),
        readPage: async (page) => {
          pages.push(page);
          return page === 1 ? firstPage : [release("cli-v1.2.3")];
        },
      }),
    ).resolves.toEqual({
      draft: false,
      prerelease: false,
      url: "https://example.test/releases/cli-v1.2.3",
    });
    expect(pages).toEqual([1, 2]);
  });

  it("reports an affirmative absence after the final partial page", async () => {
    await expect(
      readGitHubReleaseByTag({
        tag: "cli-v1.2.3",
        signal: AbortSignal.timeout(1_000),
        readPage: async () => [release("cli-v1.2.2")],
      }),
    ).resolves.toBeNull();
  });
});
