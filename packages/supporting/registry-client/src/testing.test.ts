import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { strFromU8, unzipSync } from "fflate";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";

import { RegistryClientFactory } from "./registry-client-factory.js";
import { extensionName } from "./test-helpers.js";
import {
  FIXTURE_OWNER,
  OfflineHttpClient,
  RegistryUrlTest,
  makeFileRegistry,
  makeRecordedRegistryTransport,
  testRegistryUrl,
} from "./testing.js";

describe("@agentxm/registry-client/testing", () => {
  it.effect("publishes skill exclusions and yanked release metadata", () => {
    const registry = makeFileRegistry();
    registry.writeSkill("review", [
      {
        version: "1.0.0",
        body: "Review.",
        publishIgnore: ["scratch/**"],
        yankedAt: "2026-09-01T00:00:00Z",
      },
    ]);
    return Effect.sync(() => {
      const directory = nodePath.join(
        registry.root,
        "extensions",
        FIXTURE_OWNER,
        "skills",
        "review",
      );
      const index = fs.readFileSync(nodePath.join(directory, "index.json"), "utf8");
      const archive = unzipSync(fs.readFileSync(nodePath.join(directory, "1.0.0.zip")));
      const manifest = archive["skill.json"];
      expect(index).toContain('"yankedAt": "2026-09-01T00:00:00Z"');
      expect(manifest).toBeDefined();
      expect(strFromU8(manifest ?? new Uint8Array())).toContain('"ignore": [');
      expect(strFromU8(manifest ?? new Uint8Array())).toContain('"scratch/**"');
    }).pipe(Effect.ensuring(Effect.sync(registry.cleanup)));
  });

  it.effect("reads back a skill published into the file registry", () => {
    const registry = makeFileRegistry();
    registry.writeSkill("review", [
      { version: "1.0.0", body: "First." },
      { version: "1.1.0", body: "Second." },
    ]);
    const transport = makeRecordedRegistryTransport(() => ({ body: {} }));
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const client = yield* factory.forLocation(registry.url);
      const index = yield* client.getExtensionIndex({
        owner: decodeHandleSync(FIXTURE_OWNER),
        type: "skill",
        name: extensionName("review"),
      });
      const found = Option.getOrThrow(index);
      expect(found.versions.map((entry) => entry.version)).toEqual(["1.1.0", "1.0.0"]);
      // A `file://` registry is answered from disk, never over the transport.
      expect(transport.requests).toEqual([]);
      expect(registry.storedFiles()).toEqual([
        `extensions/${FIXTURE_OWNER}/skills/review/1.0.0.zip`,
        `extensions/${FIXTURE_OWNER}/skills/review/1.1.0.zip`,
        `extensions/${FIXTURE_OWNER}/skills/review/index.json`,
      ]);
    }).pipe(
      Effect.provide(
        transport.factory.pipe(
          Layer.provideMerge(Layer.mergeAll(RegistryUrlTest(testRegistryUrl), NodeServices.layer)),
        ),
      ),
      Effect.ensuring(Effect.sync(registry.cleanup)),
    );
  });

  it.effect("refuses every request through the offline transport", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const outcome = yield* Effect.result(client.get(`${testRegistryUrl}/health`));
      expect(outcome._tag).toBe("Failure");
    }).pipe(Effect.provide(OfflineHttpClient)),
  );
});
