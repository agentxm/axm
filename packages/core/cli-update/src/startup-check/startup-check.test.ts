import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import {
  STABLE_CHANNEL_SCHEMA,
  decodeStableChannelDocumentSync,
} from "@agentxm/extension-model/unstable/release-channel";

import {
  UpdateCheck,
  UpdateCheckTest,
  readCacheStateFromPath,
} from "../update-check/update-check.js";
import { StartupUpdateCheck, refreshCache } from "./startup-check.js";

const digest = "a".repeat(64);

const channelDocument = (version = "1.2.3") => {
  const tag = `cli-v${version}`;
  const assetUrl = (name: string) =>
    `https://github.com/agentxm/axm/releases/download/${tag}/${name}`;
  return decodeStableChannelDocumentSync({
    schema: STABLE_CHANNEL_SCHEMA,
    channel: "stable",
    revision: 4,
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
        ["darwin-arm64", "axm-darwin-arm64"],
        ["darwin-x64", "axm-darwin-x64"],
        ["linux-arm64", "axm-linux-arm64"],
        ["linux-x64", "axm-linux-x64"],
        ["windows-x64", "axm-windows-x64.exe"],
      ].map(([target, name]) => ({
        target: target ?? "",
        name: name ?? "",
        url: assetUrl(name ?? ""),
        sha256: digest,
      })),
    },
    promotedAt: "2026-09-03T17:01:00Z",
  });
};

const makeHttpLayer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request))),
    ),
  );

describe("validated channel refresh", () => {
  let tempDir: string;
  let cachePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "update-check-startup-"));
    cachePath = path.join(tempDir, "update-check.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("caches a validated 200 response and its ETag", () => {
    const http = makeHttpLayer(
      () =>
        new Response(JSON.stringify(channelDocument()), {
          status: 200,
          headers: { ETag: '"revision-4"' },
        }),
    );
    const layer = Layer.mergeAll(
      NodeServices.layer,
      UpdateCheckTest(cachePath).pipe(Layer.provide(NodeServices.layer)),
      http,
    );
    return Effect.gen(function* () {
      yield* refreshCache();
      const state = yield* readCacheStateFromPath(cachePath);
      expect(state.state).toBe("fresh");
      if (state.state === "fresh") {
        expect(state.cache.document.version).toBe("1.2.3");
        expect(state.cache.etag).toBe('"revision-4"');
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("revalidates a cached document with If-None-Match on 304", () => {
    let observedEtag: string | undefined;
    const http = makeHttpLayer((request) => {
      observedEtag = request.headers["if-none-match"];
      return new Response(null, { status: 304 });
    });
    const updateCheckLayer = UpdateCheckTest(cachePath).pipe(Layer.provide(NodeServices.layer));
    const layer = Layer.mergeAll(NodeServices.layer, updateCheckLayer, http);
    return Effect.gen(function* () {
      const updateCheck = yield* UpdateCheck;
      yield* updateCheck.writeCache(channelDocument(), '"revision-4"');
      yield* refreshCache();
      expect(observedEtag).toBe('"revision-4"');
      expect((yield* readCacheStateFromPath(cachePath)).state).toBe("fresh");
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports the notification a fresh cache justifies", () => {
    const http = makeHttpLayer(() => new Response(null, { status: 500 }));
    const layer = Layer.mergeAll(
      NodeServices.layer,
      UpdateCheckTest(cachePath).pipe(Layer.provide(NodeServices.layer)),
      http,
    );
    return Effect.gen(function* () {
      const updateCheck = yield* UpdateCheck;
      yield* updateCheck.writeCache(channelDocument(), null);
      const outcome = yield* StartupUpdateCheck.run({
        localVersion: "1.0.0",
        context: {
          isJsonOutput: false,
          isUpgradeCommand: false,
          isNonInteractive: false,
          isStderrTTY: true,
          isAgentSession: false,
          noUpdateCheckEnv: false,
        },
      });
      expect(outcome._tag).toBe("Checked");
      if (outcome._tag !== "Checked") return;
      expect(outcome.refreshing).toBe(false);
      expect(outcome.notification._tag).toBe("Some");
      if (outcome.notification._tag !== "Some") return;
      expect(outcome.notification.value).toMatchObject({
        current: "1.0.0",
        latest: "1.2.3",
        audience: "human",
      });
    }).pipe(Effect.provide(layer));
  });
});
