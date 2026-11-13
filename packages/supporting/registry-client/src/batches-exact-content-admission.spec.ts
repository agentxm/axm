import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { ExactContentRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolutions";
import { MAX_RESOLUTION_REQUEST_BYTES } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { createRemoteRegistryClient } from "./remote-client.js";
import { exactVersion, extensionName, handle } from "./test-helpers.js";
import type { ValidateExtensionAccessArgs } from "./client.js";

export const specification = defineSpecification({
  requirement: "registry-client/batches-exact-content-admission",
  title: "Logical exact-content admission retains independent outcomes across bounded exchanges",
  statement:
    "AXM shall split a logical exact-content admission into requests of at most 100 items and 256 KiB, correlate outcomes by caller key, and retain each item's result independently across request boundaries while refusing all items in a malformed response batch.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution"],
  boundary: "memory",
  boundaryRationale:
    "The production client emits encoded HTTP requests to a recording transport. This proves wire shape and result mapping, not deployed server policy or real sockets.",
  methods: ["contract", "example"],
  derivedFrom: ["packages/supporting/registry-client/specs/registry-openapi.json"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const args = (index: number, publisherBindingId = "publisher"): ValidateExtensionAccessArgs => ({
  owner: handle("@acme"),
  type: "skill",
  name: extensionName(`skill-${index}`),
  exact: { version: exactVersion("1.0.0"), integrity: "sha512-accepted", publisherBindingId },
});
const fixture = (mode: "mixed" | "duplicate" | "wrong-identity" = "mixed") => {
  const batches: number[] = [];
  const bytes: number[] = [];
  const client = createRemoteRegistryClient(
    decodeHttpRegistryEndpointSync("https://registry.example.test"),
    HttpClient.make((request) =>
      Effect.sync(() => {
        expect(request.method).toBe("POST");
        expect(new URL(request.url).pathname).toBe("/v1/resolutions");
        if (request.body._tag !== "Uint8Array") throw new Error("Expected encoded JSON request");
        bytes.push(request.body.body.byteLength);
        const input = Schema.decodeUnknownSync(Schema.fromJsonString(ExactContentRequestSchema))(
          new TextDecoder().decode(request.body.body),
        );
        batches.push(input.items.length);
        const observedAt = "2026-11-13T12:00:00.000Z";
        const results = input.items.map((item, index) =>
          index % 2 === 1
            ? {
                key: item.key,
                outcome: "unavailable",
              }
            : {
                key: item.key,
                outcome: "allowed",
                identity:
                  mode === "wrong-identity" ? { ...item.identity, name: "wrong" } : item.identity,
                publisherBindingId: item.expectedPublisherBinding,
                accepted: item.accepted,
                yanked: false,
                observedAt,
              },
        );
        const first = results[0];
        if (mode === "duplicate" && first !== undefined) results.fill(first);
        return HttpClientResponse.fromWeb(
          request,
          Response.json({
            schemaVersion: 2,
            purpose: "authorize-exact",
            observedAt,
            results: results.reverse(),
          }),
        );
      }),
    ),
    undefined,
    {
      maxAttempts: 1,
      requestTimeout: "1 second",
      totalDeadline: "2 seconds",
      initialBackoff: "0 millis",
      maxBackoff: "0 millis",
    },
  );
  return { client, batches, bytes };
};

describe("logical exact-content batches", () => {
  it.effect("splits 101 items and preserves mixed reversed outcomes across both exchanges", () =>
    Effect.gen(function* () {
      const { client, batches, bytes } = fixture();
      const results = yield* client.validateExtensionAccessBatch(
        Array.from({ length: 101 }, (_, i) => args(i)),
      );
      expect(batches).toEqual([100, 1]);
      expect(bytes.every((size) => size <= MAX_RESOLUTION_REQUEST_BYTES)).toBe(true);
      expect(results).toHaveLength(101);
      expect(results.map(Result.isSuccess)).toEqual(
        Array.from({ length: 101 }, (_, i) => i % 2 === 0),
      );
    }),
  );
  it.effect("splits by encoded UTF-8 bytes before reaching the item limit", () =>
    Effect.gen(function* () {
      const { client, batches, bytes } = fixture();
      const results = yield* client.validateExtensionAccessBatch(
        Array.from({ length: 3 }, (_, i) => args(i, "é".repeat(70_000))),
      );
      expect(batches).toEqual([1, 1, 1]);
      expect(bytes.every((size) => size <= MAX_RESOLUTION_REQUEST_BYTES)).toBe(true);
      expect(results.every(Result.isSuccess)).toBe(true);
    }),
  );
  for (const mode of ["duplicate", "wrong-identity"] as const) {
    it.effect(`refuses every item when response evidence has ${mode}`, () =>
      Effect.gen(function* () {
        const { client } = fixture(mode);
        const results = yield* client.validateExtensionAccessBatch([args(0), args(1)]);
        expect(results).toHaveLength(2);
        expect(results.every(Result.isFailure)).toBe(true);
      }),
    );
  }
  it.effect("isolates a malformed response from a later independent chunk", () =>
    Effect.gen(function* () {
      const { client, batches } = fixture("duplicate");
      const results = yield* client.validateExtensionAccessBatch(
        Array.from({ length: 101 }, (_, i) => args(i)),
      );
      expect(batches).toEqual([100, 1]);
      expect(results.slice(0, 100).every(Result.isFailure)).toBe(true);
      const last = results[100];
      expect(last !== undefined && Result.isSuccess(last)).toBe(true);
    }),
  );

  it.effect("performs no exchange for an empty batch or an individually oversized item", () =>
    Effect.gen(function* () {
      const { client, batches } = fixture();
      expect(yield* client.validateExtensionAccessBatch([])).toEqual([]);
      const result = yield* Effect.result(
        client.validateExtensionAccessBatch([args(0, "a".repeat(MAX_RESOLUTION_REQUEST_BYTES))]),
      );
      expect(Result.isFailure(result)).toBe(true);
      expect(batches).toEqual([]);
    }),
  );
});
