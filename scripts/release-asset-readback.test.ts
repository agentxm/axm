import { describe, expect, it, vi } from "@effect/vitest";
import type { GitHubReleaseAssetView } from "./release-github-release-api.js";
import { makeReleaseAssetReader } from "./release-asset-readback.js";
import { contentIntegrity, publishImmutableCohort } from "./release-publication.js";

const releaseCommit = "a".repeat(40);
const bytes = new TextEncoder().encode("axm binary");
const signal = AbortSignal.timeout(1_000);

const reader = (assets: GitHubReleaseAssetView["assets"], targetCommitish = releaseCommit) => {
  const viewRelease = vi.fn(async () => ({ targetCommitish, assets }));
  const downloadAsset = vi.fn(async () => bytes);
  return {
    read: makeReleaseAssetReader({ releaseCommit, viewRelease, downloadAsset }),
    viewRelease,
    downloadAsset,
  };
};

describe("GitHub Release asset readback", () => {
  it.each([
    { observed: [], reason: "missing" },
    { observed: [{ name: "axm", state: "new", size: bytes.byteLength }], reason: "not uploaded" },
  ])("treats an asset that is $reason as absent without downloading", async ({ observed }) => {
    const { read, downloadAsset } = reader(observed);
    await expect(read({ name: "axm", size: bytes.byteLength }, signal)).resolves.toBeNull();
    expect(downloadAsset).not.toHaveBeenCalled();
  });

  it("reports an uploaded asset of another size as a mismatch without downloading", async () => {
    const { read, downloadAsset } = reader([{ name: "axm", state: "uploaded", size: 1 }]);
    await expect(read({ name: "axm", size: bytes.byteLength }, signal)).resolves.toBe("size:1");
    expect(downloadAsset).not.toHaveBeenCalled();
    const publish = vi.fn(async () => undefined);
    await expect(
      publishImmutableCohort([
        {
          name: "axm",
          integrity: contentIntegrity(bytes),
          read: (readSignal) => read({ name: "axm", size: bytes.byteLength }, readSignal),
          publish,
        },
      ]),
    ).rejects.toThrow("Published content integrity conflict: axm.");
    expect(publish).not.toHaveBeenCalled();
    expect(downloadAsset).not.toHaveBeenCalled();
  });

  it("digests the downloaded bytes of an uploaded asset at the expected size", async () => {
    const { read, downloadAsset } = reader([
      { name: "axm", state: "uploaded", size: bytes.byteLength },
    ]);
    await expect(read({ name: "axm", size: bytes.byteLength }, signal)).resolves.toBe(
      contentIntegrity(bytes),
    );
    expect(downloadAsset).toHaveBeenCalledWith("axm", signal);
  });

  it("rejects a release whose target is not the release commit", async () => {
    const { read } = reader([], "b".repeat(40));
    await expect(read({ name: "axm", size: bytes.byteLength }, signal)).rejects.toThrow(
      "GitHub Release target integrity conflict",
    );
  });

  it("shares one in-flight release view among concurrent readers and refreshes afterwards", async () => {
    const { read, viewRelease } = reader([
      { name: "one", state: "uploaded", size: bytes.byteLength },
      { name: "two", state: "new", size: 0 },
    ]);
    await expect(
      Promise.all(
        ["one", "two", "three"].map((name) => read({ name, size: bytes.byteLength }, signal)),
      ),
    ).resolves.toEqual([contentIntegrity(bytes), null, null]);
    expect(viewRelease).toHaveBeenCalledTimes(1);
    await read({ name: "one", size: bytes.byteLength }, signal);
    expect(viewRelease).toHaveBeenCalledTimes(2);
  });
});
