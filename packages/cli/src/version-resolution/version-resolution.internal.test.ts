import { STABLE_CHANNEL_SCHEMA } from "@agentxm/extension-model/unstable/release-channel";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import {
  resolveExactVersion,
  resolveLatestVersion,
  type VersionRelation,
} from "./version-resolution.js";

const digest = "a".repeat(64);

const channelDocument = (version = "1.0.0") => {
  const tag = `cli-v${version}`;
  const assetUrl = (name: string) =>
    `https://github.com/agentxm/axm/releases/download/${tag}/${name}`;
  return {
    schema: STABLE_CHANNEL_SCHEMA,
    channel: "stable",
    revision: 3,
    version,
    release: {
      repository: "agentxm/axm",
      tag,
      commit: "b".repeat(40),
      publishedAt: "2026-09-03T17:00:00Z",
    },
    artifacts: {
      checksumManifest: {
        name: "SHA256SUMS",
        url: assetUrl("SHA256SUMS"),
        sha256: digest,
      },
      binaries: [
        {
          target: "darwin-arm64",
          name: "axm-darwin-arm64",
          url: assetUrl("axm-darwin-arm64"),
          sha256: digest,
        },
        {
          target: "darwin-x64",
          name: "axm-darwin-x64",
          url: assetUrl("axm-darwin-x64"),
          sha256: digest,
        },
        {
          target: "linux-arm64",
          name: "axm-linux-arm64",
          url: assetUrl("axm-linux-arm64"),
          sha256: digest,
        },
        {
          target: "linux-x64",
          name: "axm-linux-x64",
          url: assetUrl("axm-linux-x64"),
          sha256: digest,
        },
        {
          target: "windows-x64",
          name: "axm-windows-x64.exe",
          url: assetUrl("axm-windows-x64.exe"),
          sha256: digest,
        },
      ],
    },
    promotedAt: "2026-09-03T17:01:00Z",
  };
};

const makeMockHttpClient = (handler: (url: string) => Response): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request.url))),
  );

const makeNetworkErrorClient = (): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("ECONNREFUSED"),
          description: "Connection refused",
        }),
      }),
    ),
  );

const resolve = (localVersion: string | null = "0.2.0") =>
  resolveLatestVersion(
    makeMockHttpClient(() => new Response(JSON.stringify(channelDocument()), { status: 200 })),
    localVersion,
    "axm-linux-x64",
  );

describe("resolveLatestVersion", () => {
  it.effect("resolves the promoted release in one bounded channel request", () =>
    Effect.gen(function* () {
      const visited: Array<string> = [];
      const result = yield* resolveLatestVersion(
        makeMockHttpClient((url) => {
          visited.push(url);
          return new Response(JSON.stringify(channelDocument("2.0.0")), { status: 200 });
        }),
        "1.0.0",
        "axm-linux-x64",
      );

      expect(visited).toEqual(["https://releases.axm.sh/v1/channels/stable.json"]);
      expect(result.targetVersion).toBe("2.0.0");
      expect(result.release.tagName).toBe("cli-v2.0.0");
      expect(result.release.binaryAssetUrl).toContain("axm-linux-x64");
      expect(result.channel?.revision).toBe(3);
    }),
  );

  it.effect("classifies every local version relation", () =>
    Effect.gen(function* () {
      const cases: ReadonlyArray<readonly [string | null, VersionRelation]> = [
        ["0.9.0", "upgrade-available"],
        ["1.0.0", "current"],
        ["2.0.0", "local-newer"],
        [null, "unknown-local"],
      ];

      for (const [localVersion, expected] of cases) {
        const result = yield* resolve(localVersion);
        expect(result.localVersion).toBe(localVersion);
        expect(result.versionRelation).toBe(expected);
      }
    }),
  );

  it.effect("rejects invalid channel documents and missing platform assets", () =>
    Effect.gen(function* () {
      const invalid = { ...channelDocument(), version: "1.0.0-beta.1" };
      const missing = channelDocument();
      const invalidError = yield* Effect.flip(
        resolveLatestVersion(
          makeMockHttpClient(() => new Response(JSON.stringify(invalid), { status: 200 })),
          "1.0.0",
        ),
      );
      const missingError = yield* Effect.flip(
        resolveLatestVersion(
          makeMockHttpClient(() => new Response(JSON.stringify(missing), { status: 200 })),
          "1.0.0",
          "axm-plan9-x64",
        ),
      );

      expect(invalidError.code).toBe("validation");
      expect(missingError.code).toBe("unavailable");
    }),
  );

  it.effect("maps rate limits, upstream failures, and transport failures", () =>
    Effect.gen(function* () {
      const rateLimited = makeMockHttpClient(
        () => new Response("rate limited", { status: 429, headers: { "Retry-After": "60" } }),
      );
      const unavailable = makeMockHttpClient(
        () => new Response("upstream failure", { status: 503 }),
      );

      const rateLimitError = yield* Effect.flip(resolveLatestVersion(rateLimited, "1.0.0"));
      expect(rateLimitError.code).toBe("rate_limit");
      expect(rateLimitError.detail).toContain("60");
      expect((yield* Effect.flip(resolveLatestVersion(unavailable, "1.0.0"))).code).toBe(
        "unavailable",
      );
      expect(
        (yield* Effect.flip(resolveLatestVersion(makeNetworkErrorClient(), "1.0.0"))).code,
      ).toBe("network");
    }),
  );
});

describe("resolveExactVersion", () => {
  it.effect("constructs immutable release coordinates without discovery", () =>
    Effect.gen(function* () {
      const result = yield* resolveExactVersion("1.2.3", "1.0.0", "axm-linux-x64");

      expect(result.channel).toBeNull();
      expect(result.targetVersion).toBe("1.2.3");
      expect(result.release.binaryAssetUrl).toBe(
        "https://github.com/agentxm/axm/releases/download/cli-v1.2.3/axm-linux-x64",
      );
      expect(result.versionRelation).toBe("upgrade-available");
    }),
  );

  it.effect("rejects leading-v and prerelease versions", () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(resolveExactVersion("v1.2.3", "1.0.0"))).code).toBe("validation");
      expect((yield* Effect.flip(resolveExactVersion("1.2.3-beta.1", "1.0.0"))).code).toBe(
        "validation",
      );
    }),
  );
});
