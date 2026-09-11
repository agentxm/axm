import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import {
  STABLE_CHANNEL_SCHEMA,
  decodeStableChannelDocumentSync,
} from "@agentxm/extension-model/unstable/release-channel";
import { UpdateCheck } from "@agentxm/cli-update";
import { UpdateCheckTest } from "@agentxm/cli-update/testing";

import { TestRenderer } from "./screen/index.js";
import {
  isUpgradeCommand,
  withUpdateCheck,
  type NotificationPrinter,
  type UpdateCheckContextInputs,
} from "./update-check-startup.js";

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

const baseInputs: UpdateCheckContextInputs = {
  args: ["list"],
  isNonInteractive: false,
  isJsonOutput: false,
  isStderrTTY: true,
  isAgentSession: false,
  noUpdateCheckEnv: false,
};

describe("startup update-check routing", () => {
  it("detects upgrade only before the option terminator", () => {
    expect(isUpgradeCommand(["--json", "upgrade"])).toBe(true);
    expect(isUpgradeCommand(["search", "--", "upgrade"])).toBe(false);
  });
});

describe("startup notification printing", () => {
  let tempDir: string;
  let cachePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "update-check-startup-"));
    cachePath = path.join(tempDir, "update-check.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("prints a fresh-cache notification before command output", () => {
    const events: Array<string> = [];
    const printer: NotificationPrinter = () =>
      Effect.sync(() => {
        events.push("notification");
      });
    const http = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => HttpClientResponse.fromWeb(request, new Response(null, { status: 500 }))),
      ),
    );
    const updateCheckLayer = UpdateCheckTest(cachePath).pipe(Layer.provide(NodeServices.layer));
    const { layer: rendererLayer } = TestRenderer.make();
    const layer = Layer.mergeAll(NodeServices.layer, updateCheckLayer, http, rendererLayer);
    return Effect.gen(function* () {
      const updateCheck = yield* UpdateCheck;
      yield* updateCheck.writeCache(channelDocument(), null);
      yield* withUpdateCheck(
        Effect.sync(() => {
          events.push("command");
        }),
        { localVersion: "1.0.0", inputs: baseInputs, printNotification: printer },
      );
      expect(events).toEqual(["notification", "command"]);
    }).pipe(Effect.provide(layer));
  });
});
