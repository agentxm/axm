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
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, options) =>
      options?.method === "PUT"
        ? new Response(JSON.stringify({ outcome: "promoted", document: document("1.2.3", 5) }), {
            headers: { etag: '"rev-5"' },
          })
        : new Response(JSON.stringify(document("1.2.2", 4)), {
            headers: { etag: '"rev-4"' },
          }),
    );

    await promoteStableRelease(input, fetchMock);
    const reads = fetchMock.mock.calls.filter(([, options]) => options?.method !== "PUT");
    expect(
      reads.map(([, options]) => new Headers(options?.headers).get("Accept-Encoding")),
    ).toEqual(["identity", "gzip", "br", "zstd"]);
    for (const [, options] of reads) {
      expect(options?.cache).toBe("no-store");
      const headers = new Headers(options?.headers);
      expect(headers.has("Authorization")).toBe(false);
      expect(headers.has("CF-Access-Client-Secret")).toBe(false);
    }
    expect(fetchMock).toHaveBeenLastCalledWith(
      RELEASE_CHANNEL_CONTROL_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "If-Match": '"rev-4"' }) }),
    );
  });

  for (const encoding of ["identity", "gzip", "br", "zstd"]) {
    it.each([
      {
        name: "weak validator",
        headers: new Headers({ etag: 'W/"rev-4"' }),
        message: "strong ETag",
      },
      { name: "missing validator", headers: new Headers(), message: "strong ETag" },
      {
        name: "transformed content",
        headers: new Headers({ etag: '"rev-4"', "content-encoding": "gzip" }),
        message: "transformed",
      },
    ])(`rejects $name for ${encoding} without mutation`, async ({ headers, message }) => {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
        const requested = new Headers(options?.headers).get("Accept-Encoding");
        return new Response(JSON.stringify(document("1.2.2", 4)), {
          headers: requested === encoding ? headers : { etag: '"rev-4"' },
        });
      });
      await expect(promoteStableRelease(input, fetchMock)).rejects.toThrow(message);
      expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "PUT")).toBe(true);
    });
  }

  for (const encoding of ["gzip", "br", "zstd"]) {
    it.each([
      {
        name: "different validator",
        status: 200,
        etag: '"rev-5"',
        body: JSON.stringify(document("1.2.2", 4)),
        message: "inconsistent",
      },
      {
        name: "different document",
        status: 200,
        etag: '"rev-4"',
        body: JSON.stringify(document("1.2.3", 5)),
        message: "inconsistent",
      },
      { name: "missing object", status: 404, etag: '"rev-4"', body: "", message: "HTTP 404" },
      { name: "failed read", status: 503, etag: '"rev-4"', body: "", message: "HTTP 503" },
    ])(
      `rejects $name for ${encoding} without mutation`,
      async ({ status, etag, body, message }) => {
        const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
          const requested = new Headers(options?.headers).get("Accept-Encoding");
          return requested === encoding
            ? new Response(body, { status, headers: { etag } })
            : new Response(JSON.stringify(document("1.2.2", 4)), { headers: { etag: '"rev-4"' } });
        });
        await expect(promoteStableRelease(input, fetchMock)).rejects.toThrow(message);
        expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "PUT")).toBe(true);
      },
    );
  }

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
