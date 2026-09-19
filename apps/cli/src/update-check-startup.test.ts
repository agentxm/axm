import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { rememberLatestRelease } from "@agentxm/cli-maintenance/self-update/application";
import { LatestReleaseCheckLive } from "@agentxm/cli-maintenance/self-update/composition";
import { makeUpdateCheckCacheLayer } from "@agentxm/cli-maintenance/self-update/testing/native";

import { TestRenderer } from "./test-support/presenter-test.js";
import {
  isUpgradeCommand,
  notificationMessage,
  withUpdateCheck,
  type NotificationPrinter,
  type UpdateCheckContextInputs,
} from "./update-check-startup.js";

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
  it("formats human and agent notifications at delivery", () => {
    const update = { current: "1.0.0", latest: "1.2.3" };
    expect(notificationMessage(update, "human")).toBe(
      "axm 1.2.3 is available (you have 1.0.0), run axm upgrade",
    );
    expect(notificationMessage(update, "agent")).toBe(
      'AXM_UPDATE_AVAILABLE current=1.0.0 latest=1.2.3 command="axm upgrade"',
    );
  });
  let tempDir: string;
  let cachePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "update-check-startup-"));
    cachePath = path.join(tempDir, "update-check.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  for (const testCase of [
    { audience: "a person", isAgentSession: false, order: ["command", "notification"] },
    { audience: "an agent session", isAgentSession: true, order: ["notification", "command"] },
  ]) {
    it.effect(`tells ${testCase.audience} of a fresh-cache update in its place`, () => {
      const events: Array<string> = [];
      const printer: NotificationPrinter = () =>
        Effect.sync(() => {
          events.push("notification");
        });
      const http = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() =>
            HttpClientResponse.fromWeb(request, new Response(null, { status: 500 })),
          ),
        ),
      );
      const updateCheckLayer = makeUpdateCheckCacheLayer(cachePath).pipe(
        Layer.provide(NodeServices.layer),
      );
      const { layer: rendererLayer } = TestRenderer.make();
      const layer = Layer.mergeAll(
        NodeServices.layer,
        updateCheckLayer,
        LatestReleaseCheckLive.pipe(Layer.provide(http)),
        rendererLayer,
      );
      return Effect.gen(function* () {
        yield* rememberLatestRelease("1.2.3");
        yield* withUpdateCheck(
          Effect.sync(() => {
            events.push("command");
          }),
          {
            localVersion: "1.0.0",
            inputs: { ...baseInputs, isAgentSession: testCase.isAgentSession },
            printNotification: printer,
          },
        );
        expect(events).toEqual(testCase.order);
      }).pipe(Effect.provide(layer));
    });
  }
});
