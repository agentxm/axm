import { createHash } from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Exit from "effect/Exit";
import { makeAccessibleContent } from "./accessible-content.js";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { ExactContentRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolutions";
import { makeArchiveCache } from "./archive-cache.js";
import { createRemoteRegistryClient } from "./remote-client.js";
import { exactVersion, extensionName, handle } from "./test-helpers.js";
import type { ValidateExtensionAccessArgs } from "./client.js";

export const specification = defineSpecification({
  requirement: "registry-client/content-access-is-callback-scoped",
  title: "Content admission owns one callback and all byte access within it",
  statement:
    "AXM shall admit the complete exact-content set before invoking its content callback, allow byte reads only for admitted identities while that callback is active, and require fresh admission for each subsequent callback without a per-archive authorization round inside the cache.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "A real filesystem cache is read through the production HTTP Registry adapter over a recording transport. The evidence covers local byte reuse and callback lifetime, not deployed policy or workspace settlement.",
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const bytes = new Uint8Array([1, 2, 3]);
const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const args = (name: string): ValidateExtensionAccessArgs => ({
  owner: handle("@acme"),
  type: "skill",
  name: extensionName(name),
  exact: { version: exactVersion("1.0.0"), integrity, publisherBindingId: "publisher" },
});
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-admitted-content-" });
  const cache = yield* makeArchiveCache(fs, path, root);
  yield* cache.write(integrity, bytes);
  const batches: number[] = [];
  const authority = { allowed: true };
  const client = createRemoteRegistryClient(
    decodeHttpRegistryEndpointSync("https://registry.example.test"),
    HttpClient.make((request) =>
      Effect.sync(() => {
        expect(request.method).toBe("POST");
        expect(new URL(request.url).pathname).toBe("/v1/resolutions");
        if (request.body._tag !== "Uint8Array") throw new Error("Expected encoded request");
        const input = Schema.decodeUnknownSync(Schema.fromJsonString(ExactContentRequestSchema))(
          new TextDecoder().decode(request.body.body),
        );
        batches.push(input.items.length);
        const observedAt = "2026-11-13T12:00:00Z";
        return HttpClientResponse.fromWeb(
          request,
          Response.json({
            schemaVersion: 2,
            purpose: "authorize-exact",
            observedAt,
            results: input.items.map((item) =>
              authority.allowed
                ? {
                    key: item.key,
                    outcome: "allowed",
                    identity: item.identity,
                    accepted: item.accepted,
                    publisherBindingId: item.expectedPublisherBinding,
                    yanked: false,
                    observedAt,
                  }
                : { key: item.key, outcome: "unavailable" },
            ),
          }),
        );
      }),
    ),
    cache,
  );
  return { client, batches, authority };
});

describe("callback-owned content admission", () => {
  it.effect("reads ten warm identities under one admission and rechecks in the next stage", () =>
    Effect.gen(function* () {
      const { client, batches } = yield* fixture;
      const items = Array.from({ length: 10 }, (_, i) => args(`skill-${i}`));
      yield* client.withAccessibleContent(items, (content) =>
        Effect.forEach(items, (item) =>
          content
            .read(item)
            .pipe(Effect.tap((result) => Effect.sync(() => expect(result.archive).toEqual(bytes)))),
        ),
      );
      expect(batches).toEqual([10]);
      expect((yield* client.validateExtensionAccessBatch(items)).every(Result.isSuccess)).toBe(
        true,
      );
      expect(batches).toEqual([10, 10]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("rejects unsubmitted identities and a reader retained past callback completion", () =>
    Effect.gen(function* () {
      const { client } = yield* fixture;
      const read = yield* client.withAccessibleContent([args("first")], (content) =>
        Effect.gen(function* () {
          expect(Result.isFailure(yield* Effect.result(content.read(args("other"))))).toBe(true);
          return content.read;
        }),
      );
      expect(Result.isFailure(yield* Effect.result(read(args("first"))))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect(
    "refuses warm bytes after revocation without reusing the previous callback's allowance",
    () =>
      Effect.gen(function* () {
        const { client, authority, batches } = yield* fixture;
        expect((yield* client.getExtensionPackage(args("first"))).archive).toEqual(bytes);
        authority.allowed = false;
        const denied = yield* Effect.result(client.getExtensionPackage(args("first")));
        expect(Result.isFailure(denied)).toBe(true);
        expect(batches).toEqual([1, 1]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("closes an in-flight read when its content callback ends", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const stopped = yield* Deferred.make<void>();
      const withContent = makeAccessibleContent(
        (items) => Effect.succeed(items.map(() => Result.succeed(undefined))),
        () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.succeed(stopped, undefined)),
          ),
      );
      const reader = yield* withContent([args("first")], (content) =>
        Effect.gen(function* () {
          const fiber = yield* content.read(args("first")).pipe(Effect.forkChild);
          yield* Deferred.await(started);
          return fiber;
        }),
      );
      yield* Deferred.await(stopped);
      expect(Exit.hasInterrupts(yield* Fiber.await(reader))).toBe(true);
    }),
  );
});
