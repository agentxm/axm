import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  STABLE_CHANNEL_SCHEMA,
  decodeStableChannelDocumentSync,
} from "@agentxm/extension-model/unstable/release-channel";
import { afterEach, beforeEach, describe, expect, it, layer } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  UPDATE_CHECK_CACHE_SCHEMA,
  isCacheStale,
  isUpdateAvailableFromPath,
  notificationMessage,
  readCacheFromPath,
  readCacheStateFromPath,
  shouldSkip,
  writeCacheToPath,
  type SkipCheckContext,
} from "./update-check.js";

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

const timestampAgo = (elapsed: Duration.Duration) =>
  DateTime.now.pipe(
    Effect.map((now) => DateTime.formatIso(DateTime.subtractDuration(now, elapsed))),
  );

const cacheJson = (validatedAt: string, version = "1.2.3") =>
  JSON.stringify({
    schema: UPDATE_CHECK_CACHE_SCHEMA,
    channel: "stable",
    document: channelDocument(version),
    etag: '"revision-2"',
    validatedAt,
  });

const baseSkipContext: SkipCheckContext = {
  isJsonOutput: false,
  noUpdateCheckEnv: false,
  isUpgradeCommand: false,
  isNonInteractive: false,
  isStderrTTY: true,
  isAgentSession: false,
};

describe("isCacheStale", () => {
  it.effect("uses a sixty-minute freshness boundary", () =>
    Effect.gen(function* () {
      const fresh = DateTime.subtractDuration(yield* DateTime.now, Duration.minutes(1));
      const stale = DateTime.subtractDuration(yield* DateTime.now, Duration.minutes(61));
      expect(yield* isCacheStale(fresh)).toBe(false);
      expect(yield* isCacheStale(stale)).toBe(true);
    }),
  );
});

describe("skip and notification behavior", () => {
  it("skips only declared unattended or suppressed contexts", () => {
    expect(shouldSkip(baseSkipContext)).toBe(false);
    expect(shouldSkip({ ...baseSkipContext, isJsonOutput: true })).toBe(true);
    expect(shouldSkip({ ...baseSkipContext, noUpdateCheckEnv: true })).toBe(true);
    expect(shouldSkip({ ...baseSkipContext, isUpgradeCommand: true })).toBe(true);
    expect(shouldSkip({ ...baseSkipContext, isNonInteractive: true })).toBe(true);
    expect(shouldSkip({ ...baseSkipContext, isNonInteractive: true, isAgentSession: true })).toBe(
      false,
    );
  });

  it("formats human and agent notifications", () => {
    expect(notificationMessage("1.0.0", "1.2.3")).toContain("1.0.0 → 1.2.3");
    expect(notificationMessage("1.0.0", "1.2.3", "agent")).toBe(
      'AXM_UPDATE_AVAILABLE current=1.0.0 latest=1.2.3 command="axm upgrade"',
    );
  });
});

layer(NodeServices.layer, { excludeTestServices: true })("validated channel cache", (it) => {
  let tempDir: string;
  let cachePath: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "update-check-test-"));
    cachePath = nodePath.join(tempDir, "nested", "update-check.json");
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("distinguishes missing, invalid, stale, and fresh cache states", () =>
    Effect.gen(function* () {
      expect((yield* readCacheStateFromPath(cachePath)).state).toBe("missing");

      nodeFs.mkdirSync(nodePath.dirname(cachePath), { recursive: true });
      nodeFs.writeFileSync(cachePath, "not json");
      expect((yield* readCacheStateFromPath(cachePath)).state).toBe("invalid");

      nodeFs.writeFileSync(cachePath, cacheJson(yield* timestampAgo(Duration.minutes(61))));
      expect((yield* readCacheStateFromPath(cachePath)).state).toBe("stale");

      nodeFs.writeFileSync(cachePath, cacheJson(yield* timestampAgo(Duration.minutes(1))));
      const fresh = yield* readCacheStateFromPath(cachePath);
      expect(fresh.state).toBe("fresh");
    }),
  );

  it.effect("rejects legacy and invalid channel payloads", () =>
    Effect.gen(function* () {
      nodeFs.mkdirSync(nodePath.dirname(cachePath), { recursive: true });
      nodeFs.writeFileSync(
        cachePath,
        JSON.stringify({ latestVersion: "1.2.3", checkedAt: new Date().toISOString() }),
      );
      expect((yield* readCacheStateFromPath(cachePath)).state).toBe("invalid");

      const invalidDocument = { ...channelDocument(), version: "1.2.3-beta.1" };
      nodeFs.writeFileSync(
        cachePath,
        JSON.stringify({
          schema: UPDATE_CHECK_CACHE_SCHEMA,
          channel: "stable",
          document: invalidDocument,
          etag: null,
          validatedAt: new Date().toISOString(),
        }),
      );
      expect((yield* readCacheStateFromPath(cachePath)).state).toBe("invalid");
    }),
  );

  it.effect("writes the complete cache atomically", () =>
    Effect.gen(function* () {
      yield* writeCacheToPath(cachePath, channelDocument(), '"revision-2"');
      const parsed = JSON.parse(nodeFs.readFileSync(cachePath, "utf8"));
      expect(parsed).toMatchObject({
        schema: UPDATE_CHECK_CACHE_SCHEMA,
        channel: "stable",
        etag: '"revision-2"',
        document: { version: "1.2.3", revision: 2 },
      });
      expect(nodeFs.readdirSync(nodePath.dirname(cachePath))).toEqual(["update-check.json"]);
    }),
  );

  it.effect("uses only a fresh validated document for update availability", () =>
    Effect.gen(function* () {
      yield* writeCacheToPath(cachePath, channelDocument("1.2.3"), null);
      const available = yield* isUpdateAvailableFromPath(cachePath, "1.0.0");
      expect(Option.isSome(available)).toBe(true);
      expect(Option.isNone(yield* isUpdateAvailableFromPath(cachePath, "2.0.0"))).toBe(true);
      expect(Option.isSome(yield* readCacheFromPath(cachePath))).toBe(true);
    }),
  );
});
