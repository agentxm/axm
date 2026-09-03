import { describe, expect, it, vi } from "vitest";

import {
  RELEASE_CHANNEL_CONTROL_URL,
  promoteStableRelease,
  type ReleaseChannelPromotionInput,
} from "./release-channel-promotion.js";

const input: ReleaseChannelPromotionInput = {
  version: "1.2.3",
  tag: "cli-v1.2.3",
  commit: "a".repeat(40),
  bearerToken: "workflow-token",
  accessClientId: "access-id",
  accessClientSecret: "access-secret",
};

const document = (version = "1.2.3", revision = 2) => ({
  schema: "axm.release-channel/v1",
  channel: "stable",
  revision,
  version,
  release: {
    repository: "agentxm/axm",
    tag: `cli-v${version}`,
    commit: "a".repeat(40),
    publishedAt: "2026-09-03T10:00:00.000Z",
  },
  artifacts: {
    checksumManifest: {
      name: "SHA256SUMS",
      url: `https://github.com/agentxm/axm/releases/download/cli-v${version}/SHA256SUMS`,
      sha256: "b".repeat(64),
    },
    binaries: [
      ["darwin-arm64", "axm-darwin-arm64"],
      ["darwin-x64", "axm-darwin-x64"],
      ["linux-arm64", "axm-linux-arm64"],
      ["linux-x64", "axm-linux-x64"],
      ["windows-x64", "axm-windows-x64.exe"],
    ].map(([target, name]) => ({
      target,
      name,
      url: `https://github.com/agentxm/axm/releases/download/cli-v${version}/${name}`,
      sha256: "c".repeat(64),
    })),
  },
  promotedAt: "2026-09-03T10:01:00.000Z",
});

describe("release channel promotion", () => {
  it("creates the first channel revision with If-None-Match", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ outcome: "promoted", document: document("1.2.3", 1) }), {
          status: 201,
          headers: { "content-type": "application/json", etag: '"rev-1"' },
        }),
      );

    await expect(promoteStableRelease(input, fetchMock)).resolves.toMatchObject({
      outcome: "promoted",
      document: { version: "1.2.3", revision: 1 },
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      RELEASE_CHANNEL_CONTROL_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "If-None-Match": "*" }) }),
    );
  });

  it("updates against the strong validator read from the public object", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(document("1.2.2", 4)), {
          status: 200,
          headers: { etag: '"rev-4"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ outcome: "promoted", document: document("1.2.3", 5) }), {
          status: 200,
          headers: { etag: '"rev-5"' },
        }),
      );

    await promoteStableRelease(input, fetchMock);
    expect(fetchMock).toHaveBeenLastCalledWith(
      RELEASE_CHANNEL_CONTROL_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "If-Match": '"rev-4"' }) }),
    );
  });

  it("retains a newer promoted channel without invoking the mutation endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify(document("1.3.0", 7)), {
        status: 200,
        headers: { etag: '"rev-7"' },
      }),
    );

    await expect(promoteStableRelease(input, fetchMock)).resolves.toMatchObject({
      outcome: "newer-channel-retained",
      document: { version: "1.3.0" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a response whose coordinate differs from the request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ outcome: "promoted", document: document("1.2.4", 1) }), {
          status: 201,
          headers: { etag: '"rev-1"' },
        }),
      );

    await expect(promoteStableRelease(input, fetchMock)).rejects.toThrow(
      "did not match the requested release coordinate",
    );
  });
});
