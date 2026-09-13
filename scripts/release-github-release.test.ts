import { describe, expect, it } from "vitest";

import {
  ensureExactDraftRelease,
  publishExactDraftRelease,
  type GitHubReleaseHost,
  type GitHubReleaseObservation,
} from "./release-github-release.js";

const sha = "a".repeat(40);
const release = (draft: boolean) => ({
  id: 123,
  targetCommitish: sha,
  draft,
  prerelease: false,
  url: "https://example.test/release",
});

const hostWith = (
  initial: GitHubReleaseObservation,
  options: { readonly createFails?: boolean; readonly publishFails?: boolean } = {},
) => {
  let observed = initial;
  let creates = 0;
  let publishes = 0;
  const host: GitHubReleaseHost = {
    read: async () => observed,
    createDraft: async () => {
      creates += 1;
      observed = {
        tagSha: null,
        release: release(true),
      };
      if (options.createFails === true) throw new Error("lost creation response");
    },
    publishDraft: async (releaseId) => {
      expect(releaseId).toBe(123);
      publishes += 1;
      observed = {
        tagSha: sha,
        release: release(false),
      };
      if (options.publishFails === true) throw new Error("lost publication response");
    },
  };
  return { host, creates: () => creates, publishes: () => publishes };
};

describe("GitHub Release lifecycle", () => {
  it("creates a missing draft once and reuses exact state", async () => {
    const fixture = hostWith({ tagSha: null, release: null });
    await expect(ensureExactDraftRelease(fixture.host, sha)).resolves.toBe("created-draft");
    await expect(ensureExactDraftRelease(fixture.host, sha)).resolves.toBe("reused-draft");
    expect(fixture.creates()).toBe(1);
  });

  it("settles lost create and publish responses through readback without replay", async () => {
    const fixture = hostWith(
      { tagSha: null, release: null },
      { createFails: true, publishFails: true },
    );
    await expect(ensureExactDraftRelease(fixture.host, sha)).resolves.toBe("created-draft");
    await expect(publishExactDraftRelease(fixture.host, sha)).resolves.toBe("published");
    await expect(publishExactDraftRelease(fixture.host, sha)).resolves.toBe("already-published");
    expect(fixture.creates()).toBe(1);
    expect(fixture.publishes()).toBe(1);
  });

  it("refuses a conflicting tag before mutation", async () => {
    const fixture = hostWith({ tagSha: "b".repeat(40), release: null });
    await expect(ensureExactDraftRelease(fixture.host, sha)).rejects.toThrow(
      "Release tag integrity conflict",
    );
    expect(fixture.creates()).toBe(0);
  });

  it("refuses a conflicting draft target before mutation", async () => {
    const fixture = hostWith({
      tagSha: null,
      release: { ...release(true), targetCommitish: "b".repeat(40) },
    });
    await expect(ensureExactDraftRelease(fixture.host, sha)).rejects.toThrow(
      "GitHub Release target integrity conflict",
    );
    expect(fixture.creates()).toBe(0);
  });
});
