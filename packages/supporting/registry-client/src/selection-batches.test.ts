import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  decodeHttpRegistryEndpointSync,
  decodeRegistryEndpointSync,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  ResolutionMetadataRequestSchema,
  MAX_RESOLUTION_REQUEST_BYTES,
} from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { RegistryClientFactory } from "./registry-client-factory.js";
import { createRemoteRegistryClient } from "./remote-client.js";
import { makeFileRegistry, OfflineHttpClient, RegistryClientFactoryTest } from "./testing.js";
import { testRegistryAuthority, extensionName, handle } from "./test-helpers.js";

const identity = (name: string) => ({
  owner: handle("@acme"),
  type: "skill" as const,
  name: extensionName(name),
});

it.effect("selects file Registry metadata and isolates a malformed member without networking", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const registry = yield* Effect.acquireRelease(
      Effect.sync(() => makeFileRegistry()),
      (registry) => Effect.sync(() => registry.cleanup()),
    );
    registry.writeSkill("first", [{ version: "1.0.0", body: "First" }]);
    registry.writeSkill("broken", [{ version: "1.0.0", body: "Broken" }]);
    yield* fs.writeFileString(
      path.join(registry.root, "extensions", "@acme", "skills", "broken", "index.json"),
      "{}",
    );
    const factory = yield* RegistryClientFactory;
    const client = yield* factory.forEndpoint(decodeRegistryEndpointSync(registry.url));
    const results = yield* client.selectMany([
      identity("first"),
      identity("missing"),
      identity("broken"),
    ]);
    expect(results.map(Result.isSuccess)).toEqual([true, true, false]);
    const first = results[0];
    const missing = results[1];
    expect(
      first !== undefined && Result.isSuccess(first) && Option.getOrThrow(first.success).name,
    ).toBe("first");
    expect(
      missing !== undefined && Result.isSuccess(missing) && Option.isNone(missing.success),
    ).toBe(true);
    expect(yield* client.selectMany([])).toEqual([]);
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.provideMerge(RegistryClientFactoryTest(OfflineHttpClient), NodeServices.layer),
    ),
  ),
);

for (const malformed of [false, true]) {
  it.effect(
    `splits logical HTTP selection and preserves independent chunks (malformed first chunk: ${malformed})`,
    () =>
      Effect.gen(function* () {
        const sizes: number[] = [];
        const http = HttpClient.make((request) =>
          Effect.sync(() => {
            expect(request.method).toBe("POST");
            expect(new URL(request.url).pathname).toBe("/v1/resolutions");
            if (request.body._tag !== "Uint8Array") throw new Error("Expected JSON request bytes");
            expect(request.body.body.byteLength).toBeLessThanOrEqual(MAX_RESOLUTION_REQUEST_BYTES);
            const submitted = Schema.decodeUnknownSync(
              Schema.fromJsonString(ResolutionMetadataRequestSchema),
            )(new TextDecoder().decode(request.body.body));
            sizes.push(submitted.items.length);
            return HttpClientResponse.fromWeb(
              request,
              Response.json({
                schemaVersion: 2,
                purpose: "select",
                selectionPolicyVersion: "1",
                observedAt: "2026-11-13T12:00:00Z",
                results: [...submitted.items].reverse().map((item) => ({
                  key: malformed && sizes.length === 1 ? "invalid-key" : item.key,
                  outcome: "unavailable",
                })),
              }),
            );
          }),
        );
        const client = createRemoteRegistryClient(
          decodeHttpRegistryEndpointSync("https://registry.example.test"),
          http,
          testRegistryAuthority,
        );
        const results = yield* client.selectMany(
          Array.from({ length: 101 }, (_, index) => identity(`skill-${index}`)),
        );
        expect(sizes).toEqual([100, 1]);
        expect(results.map(Result.isSuccess)).toEqual([
          ...Array.from({ length: 100 }, () => !malformed),
          true,
        ]);
        expect(yield* client.selectMany([])).toEqual([]);
        expect(sizes).toEqual([100, 1]);
      }),
  );
}
