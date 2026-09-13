import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  STABLE_CHANNEL_SCHEMA,
  decodeStableChannelDocumentSync,
} from "@agentxm/extension-model/unstable/release-channel";
import { afterEach, beforeEach, expect, layer } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { makeUpdateCheckCache } from "./index.js";

const digest = "a".repeat(64);

const channelDocument = (version = "1.2.3") => {
  const tag = `cli-v${version}`;
  const assetUrl = (name: string) =>
    `https://github.com/agentxm/axm/releases/download/${tag}/${name}`;
  return decodeStableChannelDocumentSync({
    schema: STABLE_CHANNEL_SCHEMA,
    channel: "stable",
    revision: 2,
    version,
    release: {
      repository: "agentxm/axm",
      tag,
      commit: "b".repeat(40),
      publishedAt: "2026-09-03T17:00:00Z",
    },
    artifacts: {
      checksumManifest: { name: "SHA256SUMS", url: assetUrl("SHA256SUMS"), sha256: digest },
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
};

layer(NodeServices.layer, { excludeTestServices: true })("validated update-cache adapter", (it) => {
  let tempDir: string;
  let cachePath: string;
  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "update-check-test-"));
    cachePath = nodePath.join(tempDir, "nested", "update-check.json");
  });
  afterEach(() => nodeFs.rmSync(tempDir, { recursive: true, force: true }));

  const cache = Effect.gen(function* () {
    return makeUpdateCheckCache(cachePath, yield* FileSystem.FileSystem, yield* Path.Path);
  });

  it.effect("returns no snapshot for missing, malformed, or superseded cache data", () =>
    Effect.gen(function* () {
      const store = yield* cache;
      expect(yield* store.read()).toEqual(Option.none());
      nodeFs.mkdirSync(nodePath.dirname(cachePath), { recursive: true });
      const now = DateTime.formatIso(yield* DateTime.now);
      for (const content of [
        "not json",
        JSON.stringify({ latestVersion: "1.2.3", checkedAt: now }),
        JSON.stringify({
          schema: "axm.update-check-cache/v2",
          channel: "stable",
          document: { ...channelDocument(), version: "1.2.3-beta.1" },
          etag: null,
          validatedAt: now,
        }),
      ]) {
        nodeFs.writeFileSync(cachePath, content);
        expect(yield* store.read()).toEqual(Option.none());
      }
    }),
  );

  it.effect("round-trips the owner's snapshot while keeping physical schema fields private", () =>
    Effect.gen(function* () {
      const store = yield* cache;
      const snapshot = {
        document: channelDocument(),
        etag: '"revision-2"',
        validatedAt: yield* DateTime.now,
      };
      yield* store.write(snapshot);
      expect(yield* store.read()).toEqual(Option.some(snapshot));
      const parsed = JSON.parse(nodeFs.readFileSync(cachePath, "utf8"));
      expect(parsed).toMatchObject({
        schema: "axm.update-check-cache/v2",
        channel: "stable",
        etag: '"revision-2"',
        document: { version: "1.2.3", revision: 2 },
      });
      expect(nodeFs.readdirSync(nodePath.dirname(cachePath))).toEqual(["update-check.json"]);
    }),
  );

  it.effect("reports storage failure through the owner-defined error", () =>
    Effect.gen(function* () {
      nodeFs.writeFileSync(nodePath.dirname(cachePath), "a file blocks directory creation");
      const store = yield* cache;
      const error = yield* Effect.flip(
        store.write({ document: channelDocument(), etag: null, validatedAt: yield* DateTime.now }),
      );
      expect(error._tag).toBe("UpdateCheckUnavailable");
      expect(error.operation).toBe("cache-write");
    }),
  );
});
