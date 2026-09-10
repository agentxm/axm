import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";

import { RegistryClientFactory, RegistryClientFactoryLive } from "./registry-client-factory.js";
import { RegistryUrl } from "./registry-url.js";

const makeLayer = (defaultLocation: string) =>
  Layer.provide(
    RegistryClientFactoryLive,
    Layer.mergeAll(
      NodeServices.layer,
      FetchHttpClient.layer,
      Layer.succeed(RegistryUrl, defaultLocation),
    ),
  );

describe("RegistryClientFactory", () => {
  it.effect("hands out a client for the configured default registry", () => {
    const root = mkdtempSync(nodePath.join(tmpdir(), "axm-registry-factory-"));
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const client = yield* factory.forDefaultRegistry;
      const index = yield* client.getExtensionIndex({
        owner: decodeHandleSync("@acme"),
        type: "skill",
        name: decodeExtensionNameSync("absent"),
      });
      expect(Option.isNone(index)).toBe(true);
    }).pipe(
      Effect.provide(makeLayer(root)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true }))),
    );
  });

  it.effect("hands out a client for a named location other than the default", () => {
    const defaultRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-registry-factory-default-"));
    const namedRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-registry-factory-named-"));
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const client = yield* factory.forLocation(`file://${namedRoot}`);
      const index = yield* client.getExtensionIndex({
        owner: decodeHandleSync("@acme"),
        type: "skill",
        name: decodeExtensionNameSync("absent"),
      });
      expect(Option.isNone(index)).toBe(true);
    }).pipe(
      Effect.provide(makeLayer(defaultRoot)),
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(defaultRoot, { recursive: true, force: true });
          rmSync(namedRoot, { recursive: true, force: true });
        }),
      ),
    );
  });
});
