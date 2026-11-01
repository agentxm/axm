import { describe, expect, it, vi } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import type { GitHubReleaseAssetView } from "./release-github-release-api.js";
import { makeReleaseAssetReader } from "./release-asset-readback.js";
import { contentIntegrity, publishImmutableCohort } from "./release-publication.js";

const releaseCommit = "a".repeat(40);
const bytes = new TextEncoder().encode("axm binary");

const reader = (assets: GitHubReleaseAssetView["assets"], targetCommitish = releaseCommit) =>
  Effect.gen(function* () {
    const viewRelease = vi.fn(() => ({ targetCommitish, assets }));
    const downloadAsset = vi.fn((_name: string) => Effect.succeed(bytes));
    const read = yield* makeReleaseAssetReader({
      releaseCommit,
      viewRelease: Effect.sync(viewRelease),
      downloadAsset,
    });
    return { read, viewRelease, downloadAsset };
  });

describe("GitHub Release asset readback", () => {
  for (const { observed, reason } of [
    { observed: [], reason: "missing" },
    { observed: [{ name: "axm", state: "new", size: bytes.byteLength }], reason: "not uploaded" },
  ]) {
    it.effect(`treats an asset that is ${reason} as absent without downloading`, () =>
      Effect.gen(function* () {
        const { read, downloadAsset } = yield* reader(observed);
        expect(yield* read({ name: "axm", size: bytes.byteLength })).toBeNull();
        expect(downloadAsset).not.toHaveBeenCalled();
      }),
    );
  }

  it.effect("rejects an uploaded size mismatch before downloading or publishing", () =>
    Effect.gen(function* () {
      const { read, downloadAsset } = yield* reader([{ name: "axm", state: "uploaded", size: 1 }]);
      expect(yield* read({ name: "axm", size: bytes.byteLength })).toBe("size:1");
      const publish = vi.fn();
      const failure = yield* Effect.flip(
        publishImmutableCohort([
          {
            name: "axm",
            integrity: contentIntegrity(bytes),
            read: read({ name: "axm", size: bytes.byteLength }),
            publish: Effect.sync(publish),
          },
        ]),
      );
      expect(failure.message).toContain("Published content integrity conflict: axm.");
      expect(publish).not.toHaveBeenCalled();
      expect(downloadAsset).not.toHaveBeenCalled();
    }),
  );

  it.effect("digests uploaded bytes at the expected size", () =>
    Effect.gen(function* () {
      const { read, downloadAsset } = yield* reader([
        { name: "axm", state: "uploaded", size: bytes.byteLength },
      ]);
      expect(yield* read({ name: "axm", size: bytes.byteLength })).toBe(contentIntegrity(bytes));
      expect(downloadAsset).toHaveBeenCalledWith("axm");
    }),
  );

  it.effect("rejects a release whose target is not the release commit", () =>
    Effect.gen(function* () {
      const { read } = yield* reader([], "b".repeat(40));
      expect(yield* Effect.flip(read({ name: "axm", size: bytes.byteLength }))).toMatchObject({
        _tag: "ReleaseAssetTargetConflict",
        expected: releaseCommit,
        observed: "b".repeat(40),
      });
    }),
  );

  it.effect(
    "shares a pending view, isolates reader interruption, and refreshes settled views",
    () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const finish = yield* Deferred.make<void>();
        const view = vi.fn();
        const read = yield* makeReleaseAssetReader({
          releaseCommit,
          viewRelease: Effect.gen(function* () {
            view();
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(finish);
            return { targetCommitish: releaseCommit, assets: [] };
          }),
          downloadAsset: () => Effect.succeed(bytes),
        });
        const first = yield* Effect.forkChild(read({ name: "one", size: 0 }));
        yield* Deferred.await(started);
        const second = yield* Effect.forkChild(read({ name: "two", size: 0 }));
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(first);
        yield* Deferred.succeed(finish, undefined);
        expect(yield* Fiber.join(second)).toBeNull();
        expect(view).toHaveBeenCalledTimes(1);
        yield* read({ name: "three", size: 0 });
        expect(view).toHaveBeenCalledTimes(2);
      }),
  );

  it.effect("cancels the underlying view when every reader abandons it", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const canceled = yield* Deferred.make<void>();
      const read = yield* makeReleaseAssetReader({
        releaseCommit,
        viewRelease: Effect.andThen(Deferred.succeed(started, undefined), Effect.never).pipe(
          Effect.onInterrupt(() => Deferred.succeed(canceled, undefined)),
        ),
        downloadAsset: () => Effect.succeed(bytes),
      });
      const fiber = yield* Effect.forkChild(read({ name: "one", size: 0 }));
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(yield* Deferred.isDone(canceled)).toBe(true);
    }),
  );
});
