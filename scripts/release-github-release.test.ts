import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ReleaseBoundaryFailed } from "./release-publication.js";

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
  const host: GitHubReleaseHost<ReleaseBoundaryFailed, never> = {
    read: Effect.sync(() => observed),
    createDraft: () =>
      Effect.gen(function* () {
        creates += 1;
        observed = {
          tagSha: null,
          release: release(true),
        };
        if (options.createFails === true)
          return yield* new ReleaseBoundaryFailed({ cause: new Error("lost creation response") });
      }),
    publishDraft: (releaseId) =>
      Effect.gen(function* () {
        expect(releaseId).toBe(123);
        publishes += 1;
        observed = {
          tagSha: sha,
          release: release(false),
        };
        if (options.publishFails === true)
          return yield* new ReleaseBoundaryFailed({
            cause: new Error("lost publication response"),
          });
      }),
  };
  return { host, creates: () => creates, publishes: () => publishes };
};

describe("GitHub Release lifecycle", () => {
  it.effect("creates a missing draft once and reuses exact state", () =>
    Effect.gen(function* () {
      const fixture = hostWith({ tagSha: null, release: null });
      expect(yield* ensureExactDraftRelease(fixture.host, sha)).toBe("created-draft");
      expect(yield* ensureExactDraftRelease(fixture.host, sha)).toBe("reused-draft");
      expect(fixture.creates()).toBe(1);
    }),
  );

  it.effect("settles lost create and publish responses through readback without replay", () =>
    Effect.gen(function* () {
      const fixture = hostWith(
        { tagSha: null, release: null },
        { createFails: true, publishFails: true },
      );
      expect(yield* ensureExactDraftRelease(fixture.host, sha)).toBe("created-draft");
      expect(yield* publishExactDraftRelease(fixture.host, sha)).toBe("published");
      expect(yield* publishExactDraftRelease(fixture.host, sha)).toBe("already-published");
      expect(fixture.creates()).toBe(1);
      expect(fixture.publishes()).toBe(1);
    }),
  );

  it.effect("refuses a conflicting tag before mutation", () =>
    Effect.gen(function* () {
      const fixture = hostWith({ tagSha: "b".repeat(40), release: null });
      expect((yield* Effect.flip(ensureExactDraftRelease(fixture.host, sha))).message).toContain(
        "Release tag integrity conflict",
      );
      expect(fixture.creates()).toBe(0);
    }),
  );

  it.effect("refuses a conflicting draft target before mutation", () =>
    Effect.gen(function* () {
      const fixture = hostWith({
        tagSha: null,
        release: { ...release(true), targetCommitish: "b".repeat(40) },
      });
      expect((yield* Effect.flip(ensureExactDraftRelease(fixture.host, sha))).message).toContain(
        "GitHub Release target integrity conflict",
      );
      expect(fixture.creates()).toBe(0);
    }),
  );
});
