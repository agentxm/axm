import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { STABLE_CHANNEL_SCHEMA, decodeStableChannelDocument } from "./release-channel.js";

const digest = "a".repeat(64);
const tag = "cli-v0.28.5";
const assetUrl = (name: string) =>
  `https://github.com/agentxm/axm/releases/download/${tag}/${name}`;

const validDocument = () => ({
  schema: STABLE_CHANNEL_SCHEMA,
  channel: "stable",
  revision: 1,
  version: "0.28.5",
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
});

describe("StableChannelDocumentV1Schema", () => {
  it.effect("decodes the complete stable channel document", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeStableChannelDocument(validDocument());
      expect(decoded.version).toBe("0.28.5");
      expect(decoded.artifacts.binaries).toHaveLength(5);
    }),
  );

  it.effect("rejects prereleases and coordinates that disagree with the version", () =>
    Effect.gen(function* () {
      const prerelease = { ...validDocument(), version: "0.29.0-beta.1" };
      const mismatched = {
        ...validDocument(),
        release: { ...validDocument().release, tag: "cli-v0.28.4" },
      };

      expect(yield* Effect.flip(decodeStableChannelDocument(prerelease))).toBeDefined();
      expect(yield* Effect.flip(decodeStableChannelDocument(mismatched))).toBeDefined();
    }),
  );

  it.effect("rejects missing targets, untrusted URLs, and invalid time ordering", () =>
    Effect.gen(function* () {
      const document = validDocument();
      const missingTarget = {
        ...document,
        artifacts: { ...document.artifacts, binaries: document.artifacts.binaries.slice(0, 4) },
      };
      const untrustedUrl = {
        ...document,
        artifacts: {
          ...document.artifacts,
          checksumManifest: {
            ...document.artifacts.checksumManifest,
            url: "https://example.com/SHA256SUMS",
          },
        },
      };
      const invalidTime = { ...document, promotedAt: "2026-09-03T16:59:59Z" };

      expect(yield* Effect.flip(decodeStableChannelDocument(missingTarget))).toBeDefined();
      expect(yield* Effect.flip(decodeStableChannelDocument(untrustedUrl))).toBeDefined();
      expect(yield* Effect.flip(decodeStableChannelDocument(invalidTime))).toBeDefined();
    }),
  );
});
